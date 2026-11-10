import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";
import { Router, type Request, type Response } from "express";
import {
  CreateShopifyCheckoutPaymentSessionBody,
  CreateShopifyCheckoutPaymentSessionResponse,
  CreateShopifyCheckoutQuoteBody,
  CreateShopifyCheckoutQuoteResponse,
  GetShopifyCheckoutPaymentStatusResponse,
  GetShopifyCheckoutPaymentStatusQueryParams,
} from "@workspace/api-zod";
import {
  cashfreeCheckoutOrdersTable,
  checkoutShipmentPackagesTable,
  db,
} from "@workspace/db";
import {
  assertCashfreeLiveReadiness,
  CashfreeError,
  createCashfreeOrder,
  getCashfreeEnvironment,
  getCashfreeOrder,
  getCashfreePaymentReference,
  getCashfreePaymentOutcome,
  verifyCashfreeWebhookSignature,
} from "../lib/cashfreeClient";
import {
  addMoney,
  checkoutCartFingerprint,
  getShopperQuoteHash,
  getCartDiscountAmount,
  getCheckoutItemTotal,
  minimalCartSnapshot,
  splitMoney,
  type CheckoutAddress,
} from "../lib/checkoutPricing";
import {
  bookShiprocketPackage,
  quoteShiprocketPackage,
  createShiprocketPackage,
  getShiprocketModeForProductTags,
  getConfiguredParcel,
  getShiprocketShipmentDetails,
  ShiprocketError,
  type ShiprocketQuote,
} from "../lib/shiprocketClient";
import {
  advanceShipmentLifecycle,
  isShipmentBookedOrBeyond,
  shipmentLifecycleFromTracking,
} from "../lib/shipmentLifecycle";
import {
  assertShopifyCheckoutCapabilities,
  createOrFindShopifyPaidOrder,
  ShopifyCheckoutSyncError,
} from "../lib/shopifyCheckoutOrder";
import {
  getAvailableCountries,
  removePurchasedCartQuantities,
  prepareShopifyCheckoutCart,
  ShopifyCheckoutInputError,
  type ShopifyCartNode,
} from "./shopify";
import { logger } from "../lib/logger";
import { getShopifyStorefrontDomain } from "../lib/shopifyStorefrontClient";

type CheckoutSnapshot = {
  shopperUserId?: string;
  email: string;
  phone: string;
  address: CheckoutAddress;
  cart: ShopifyCartNode;
  providerPackages: ShiprocketQuote[];
  courierName: string;
  parcelCount: number;
};

type CheckoutOrderRow = typeof cashfreeCheckoutOrdersTable.$inferSelect;

const router = Router();
const RATE_WINDOW_MS = 60_000;
const RAILWAY_SHOPIFY_STORE = "gtnbsw-x3.myshopify.com";
const quoteAttempts = new Map<string, { count: number; resetsAt: number }>();
const sessionAttempts = new Map<string, { count: number; resetsAt: number }>();

function allowRequest(
  store: Map<string, { count: number; resetsAt: number }>,
  key: string,
  limit: number,
): boolean {
  const now = Date.now();
  if (store.size > 5_000) {
    for (const [entryKey, entry] of store) {
      if (now >= entry.resetsAt) store.delete(entryKey);
    }
  }
  const current = store.get(key);
  if (!current || now >= current.resetsAt) {
    store.set(key, { count: 1, resetsAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

async function assertRailwayShopifyStore(): Promise<void> {
  let connectedDomain: string;
  try {
    connectedDomain = await getShopifyStorefrontDomain();
  } catch {
    throw new ShopifyCheckoutInputError(
      "The Railway-connected Shopify storefront could not be verified.",
      503,
    );
  }
  if (connectedDomain !== RAILWAY_SHOPIFY_STORE) {
    throw new ShopifyCheckoutInputError(
      `Checkout is paused because the connected Shopify store is not ${RAILWAY_SHOPIFY_STORE}.`,
      503,
    );
  }
}

function snapshotFromRow(row: CheckoutOrderRow): CheckoutSnapshot {
  const snapshot = row.checkoutSnapshot as CheckoutSnapshot;
  if (
    !snapshot ||
    typeof snapshot.email !== "string" ||
    typeof snapshot.phone !== "string" ||
    !snapshot.address ||
    !snapshot.cart ||
    !Array.isArray(snapshot.providerPackages)
  ) {
    throw new Error("Checkout snapshot is incomplete.");
  }
  return snapshot;
}

function rawCheckoutSnapshot(row: CheckoutOrderRow): Record<string, unknown> {
  const value: unknown = row.checkoutSnapshot;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function ownershipSnapshot(row: CheckoutOrderRow): { shopperUserId?: string } {
  const shopperUserId = rawCheckoutSnapshot(row).shopperUserId;
  return typeof shopperUserId === "string" ? { shopperUserId } : {};
}

function requireCheckoutUser(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue to checkout." });
    return null;
  }
  return userId;
}

async function checkoutBelongsToShopper(
  row: CheckoutOrderRow,
  userId: string,
): Promise<boolean> {
  const snapshot = rawCheckoutSnapshot(row);
  if (typeof snapshot.shopperUserId === "string") {
    return snapshot.shopperUserId === userId;
  }
  if (typeof snapshot.email !== "string") return false;

  const checkoutEmail = snapshot.email.trim().toLowerCase();
  if (!checkoutEmail) return false;
  const user = await clerkClient.users.getUser(userId);
  const ownsLegacyQuote = user.emailAddresses.some((address) =>
    address.verification?.status === "verified" &&
    address.emailAddress.trim().toLowerCase() === checkoutEmail,
  );
  if (!ownsLegacyQuote) return false;

  const boundSnapshot = { ...snapshot, shopperUserId: userId };
  const [bound] = await db.update(cashfreeCheckoutOrdersTable)
    .set({ checkoutSnapshot: boundSnapshot, updatedAt: new Date() })
    .where(and(
      eq(cashfreeCheckoutOrdersTable.id, row.id),
      eq(cashfreeCheckoutOrdersTable.checkoutSnapshot, row.checkoutSnapshot),
    ))
    .returning();
  if (bound) {
    row.checkoutSnapshot = bound.checkoutSnapshot;
    return true;
  }

  const [latest] = await db.select()
    .from(cashfreeCheckoutOrdersTable)
    .where(eq(cashfreeCheckoutOrdersTable.id, row.id))
    .limit(1);
  return rawCheckoutSnapshot(latest ?? row).shopperUserId === userId;
}

function moneyForCashfree(amount: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0 || Math.round(parsed * 100) / 100 !== parsed) {
    throw new Error("The quoted amount cannot be charged in INR paise.");
  }
  return parsed.toFixed(2);
}

function cashfreeReturnUrl(orderId: string, req: Request): string {
  let url: URL;
  if (process.env.NODE_ENV !== "production") {
    const requestOrigin = req.get("origin");
    if (!requestOrigin) throw new Error("The sandbox checkout origin could not be verified.");
    const origin = new URL(requestOrigin);
    const hostname = origin.hostname.toLowerCase();
    const allowedDevHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".replit.dev") ||
      hostname.endsWith(".repl.co");
    if (!allowedDevHost || (origin.protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1")) {
      throw new Error("The sandbox checkout origin is not allowed.");
    }
    const referer = req.get("referer");
    let basePath = "";
    if (referer) {
      const refererUrl = new URL(referer);
      if (refererUrl.origin !== origin.origin) {
        throw new Error("The sandbox checkout return page could not be verified.");
      }
      basePath = refererUrl.pathname.replace(/\/Checkout\/?$/i, "").replace(/\/$/, "");
    }
    url = new URL(`${basePath}/Confirmation`, origin);
  } else {
    const appOrigin = process.env.APP_ORIGIN?.split(",")[0]?.trim();
    if (!appOrigin) throw new Error("APP_ORIGIN is not configured for the Cashfree return URL.");
    const origin = new URL(appOrigin);
    if (origin.protocol !== "https:") {
      throw new Error("APP_ORIGIN must use HTTPS for Cashfree checkout.");
    }
    url = new URL("/Confirmation", origin);
  }
  url.searchParams.set("cashfree_order_id", orderId);
  return url.toString();
}

function responseForQuote(row: CheckoutOrderRow) {
  const snapshot = snapshotFromRow(row);
  return CreateShopifyCheckoutQuoteResponse.parse({
    quoteId: row.id,
    expiresAt: row.quoteExpiresAt.toISOString(),
    destinationCountryCode: snapshot.address.countryCode.toUpperCase(),
    currencyCode: row.currencyCode,
    itemSubtotal: row.itemSubtotal,
    discountAmount: row.discountAmount,
    shippingAmount: row.shippingAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    carrier: "Shiprocket",
    courierName: snapshot.courierName,
    parcelCount: snapshot.parcelCount,
    excludedCharges: snapshot.address.countryCode.toUpperCase() === "IN"
      ? []
      : [
          "Import duties and taxes not included in the carrier quote",
          "Customs clearance or destination-country fees charged separately",
        ],
  });
}

function paymentStatusForOrder(status: CheckoutOrderRow["paymentStatus"]):
  "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "UNKNOWN" {
  switch (status) {
    case "not_started":
    case "pending":
      return "PENDING";
    case "paid":
      return "PAID";
    case "failed":
      return "FAILED";
    case "refund_pending":
    case "refunded":
      return "REFUNDED";
    case "reconciliation_required":
      return "UNKNOWN";
  }
}

function messageForOrder(row: CheckoutOrderRow): string {
  if (row.shopifyOrderId && row.cartCleanupStatus === "failed") {
    return `Order ${row.shopifyOrderName ?? "confirmation"} is saved, but your bag could not be refreshed. Review the bag before placing another order.`;
  }
  switch (row.status) {
    case "quote_ready":
      return "Your shipping quote is ready. Payment has not started.";
    case "payment_pending":
      return "Payment is processing. The order will be confirmed only after Cashfree verifies it.";
    case "payment_failed":
      return row.lastError || "Payment was not completed. No paid Shopify order was created.";
    case "paid":
    case "shopify_sync_pending":
      return "Cashfree confirms payment. We are saving the Shopify order; do not pay again.";
    case "shopify_synced":
      return getCashfreeEnvironment() === "sandbox"
        ? `Sandbox payment verified. Shopify test order ${row.shopifyOrderName ?? "created"}; no shipment was booked.`
        : `Payment verified. Shopify order ${row.shopifyOrderName ?? "created"} is being prepared for shipment.`;
    case "shipment_booking_pending":
      return "Payment and Shopify order are confirmed. Carrier booking is still pending; do not pay again.";
    case "completed":
      return `Payment, Shopify order ${row.shopifyOrderName ?? "confirmation"}, and carrier booking are complete.`;
    case "refund_pending":
      return "A refund is being processed. The payment and Shopify order need reconciliation.";
    case "refunded":
      return "Cashfree confirms the refund. The Shopify order requires merchant reconciliation.";
    case "reconciliation_required":
      return row.shopifyOrderId
        ? "The payment and Shopify order are saved, but carrier or refund reconciliation needs merchant review. Do not pay again."
        : "Payment or refund details need merchant review. Do not submit another payment.";
  }
}

function safeErrorForSync(error: unknown): string {
  if (error instanceof ShopifyCheckoutSyncError) return "Shopify order synchronization failed.";
  return "Shopify order synchronization is temporarily unavailable.";
}

async function cleanPurchasedCart(row: CheckoutOrderRow): Promise<CheckoutOrderRow> {
  if (
    !row.shopifyOrderId ||
    row.cartCleanupStatus !== "not_started" ||
    !row.purchasedCartLines.length
  ) return row;

  const [claimed] = await db.update(cashfreeCheckoutOrdersTable)
    .set({ cartCleanupStatus: "processing", updatedAt: new Date() })
    .where(and(
      eq(cashfreeCheckoutOrdersTable.id, row.id),
      eq(cashfreeCheckoutOrdersTable.cartCleanupStatus, "not_started"),
    ))
    .returning();
  if (!claimed) {
    return (await db.select().from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id)).limit(1))[0] ?? row;
  }

  try {
    await removePurchasedCartQuantities({
      cartId: claimed.cartId,
      lines: claimed.purchasedCartLines,
    });
    const [updated] = await db.update(cashfreeCheckoutOrdersTable)
      .set({ cartCleanupStatus: "completed", updatedAt: new Date() })
      .where(and(
        eq(cashfreeCheckoutOrdersTable.id, claimed.id),
        eq(cashfreeCheckoutOrdersTable.cartCleanupStatus, "processing"),
      ))
      .returning();
    return updated ?? claimed;
  } catch (error) {
    logger.warn({
      checkoutOrderId: claimed.cashfreeOrderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Paid Shopify order cart cleanup failed");
    const [updated] = await db.update(cashfreeCheckoutOrdersTable)
      .set({ cartCleanupStatus: "failed", updatedAt: new Date() })
      .where(and(
        eq(cashfreeCheckoutOrdersTable.id, claimed.id),
        eq(cashfreeCheckoutOrdersTable.cartCleanupStatus, "processing"),
      ))
      .returning();
    return updated ?? claimed;
  }
}

async function syncShopifyOrder(orderId: string, paymentReference: string): Promise<CheckoutOrderRow | null> {
  const [row] = await db.select()
    .from(cashfreeCheckoutOrdersTable)
    .where(eq(cashfreeCheckoutOrdersTable.cashfreeOrderId, orderId))
    .limit(1);
  if (!row) return null;
  if (["refund_pending", "refunded", "reconciliation_required"].includes(row.status)) return row;
  if (row.shopifyOrderId) return cleanPurchasedCart(row);

  const retryAfter = new Date(Date.now() - 60_000);
  const [claimed] = await db.update(cashfreeCheckoutOrdersTable)
    .set({
      status: "shopify_sync_pending",
      paymentStatus: "paid",
      paymentReference,
      paidAt: row.paidAt ?? new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(cashfreeCheckoutOrdersTable.id, row.id),
      or(
        eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
        eq(cashfreeCheckoutOrdersTable.status, "payment_pending"),
        eq(cashfreeCheckoutOrdersTable.status, "payment_failed"),
        eq(cashfreeCheckoutOrdersTable.status, "paid"),
        and(
          eq(cashfreeCheckoutOrdersTable.status, "shopify_sync_pending"),
          lt(cashfreeCheckoutOrdersTable.updatedAt, retryAfter),
        ),
      ),
    ))
    .returning();
  if (!claimed) {
    return (await db.select().from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id)).limit(1))[0] ?? row;
  }

  try {
    const snapshot = snapshotFromRow(claimed);
    const purchasedCartLines = snapshot.cart.lines.nodes.map((line) => ({
      id: line.id,
      quantity: line.quantity,
    }));
    const order = await createOrFindShopifyPaidOrder({
      orderId: claimed.cashfreeOrderId,
      paymentReference,
      snapshot: {
        cart: snapshot.cart,
        email: snapshot.email,
        phone: snapshot.phone,
        address: snapshot.address,
        shippingAmount: claimed.shippingAmount,
        shippingCurrencyCode: claimed.currencyCode,
        courierName: snapshot.courierName,
        totalAmount: claimed.totalAmount,
        taxAmount: claimed.taxAmount,
        itemSubtotal: claimed.itemSubtotal,
        discountAmount: claimed.discountAmount,
      },
    });
    const sandbox = getCashfreeEnvironment() === "sandbox";
    const [updated] = await db.update(cashfreeCheckoutOrdersTable)
      .set({
        status: sandbox ? "shopify_synced" : "shipment_booking_pending",
        paymentStatus: "paid",
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        purchasedCartLines,
        paymentReference,
        paidAt: claimed.paidAt ?? new Date(),
        checkoutSnapshot: sandbox ? ownershipSnapshot(claimed) : claimed.checkoutSnapshot,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id))
      .returning();
    return cleanPurchasedCart(updated ?? claimed);
  } catch (error) {
    logger.error({
      checkoutOrderId: row.cashfreeOrderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Paid checkout could not sync to Shopify");
    const [updated] = await db.update(cashfreeCheckoutOrdersTable)
      .set({
        status: "shopify_sync_pending",
        paymentReference,
        paidAt: claimed.paidAt ?? new Date(),
        lastError: safeErrorForSync(error),
        updatedAt: new Date(),
      })
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id))
      .returning();
    return updated ?? claimed;
  }
}

async function bookQuotedShipments(row: CheckoutOrderRow): Promise<CheckoutOrderRow> {
  if (
    getCashfreeEnvironment() !== "production" ||
    row.paymentStatus !== "paid" ||
    !row.shopifyOrderId
  ) {
    return row;
  }
  const allowAwb = process.env.SHIPROCKET_LIVE_BOOKING_ENABLED === "true";
  const packages = await db.select()
    .from(checkoutShipmentPackagesTable)
    .where(eq(checkoutShipmentPackagesTable.checkoutOrderId, row.id));
  const now = new Date();
  const retryAfter = new Date(Date.now() - 60_000);
  for (const shipment of packages) {
    if (shipment.awbCode) {
      const status = advanceShipmentLifecycle(shipment.status, "booked", true);
      if (status !== shipment.status) {
        await db.update(checkoutShipmentPackagesTable)
          .set({ status, updatedAt: now })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
      }
      continue;
    }
    if (shipment.status === "cancelled" || shipment.status === "returned" || shipment.status === "delivered") {
      continue;
    }
    if (!allowAwb && shipment.shiprocketOrderId && shipment.shiprocketShipmentId) continue;

    const isManualReconciliationState =
      shipment.status === "booking_pending" ||
      shipment.status === "booking_failed" ||
      shipment.status === "failed";
    const hasPartialProviderReference = Boolean(
      shipment.shiprocketOrderId || shipment.shiprocketShipmentId,
    ) && !(shipment.shiprocketOrderId && shipment.shiprocketShipmentId);
    if (hasPartialProviderReference) {
      // Never create a second provider order to repair a partial response.
      await db.update(checkoutShipmentPackagesTable)
        .set({
          status: "booking_pending",
          lastError: "Shiprocket references are incomplete. Reconcile the existing order before retrying.",
          updatedAt: now,
        })
        .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
      continue;
    }
    if (
      shipment.status === "booking_pending" &&
      shipment.updatedAt.getTime() > retryAfter.getTime()
    ) continue;
    if (isManualReconciliationState || isShipmentBookedOrBeyond(shipment.status)) {
      if (!allowAwb || !shipment.shiprocketShipmentId) continue;
      try {
        const existing = await getShiprocketShipmentDetails(shipment.shiprocketShipmentId);
        if (!existing.awbCode) continue;
        const providerStatus = shipmentLifecycleFromTracking(existing.status, null);
        const status = advanceShipmentLifecycle("booked", providerStatus, true);
        await db.update(checkoutShipmentPackagesTable)
          .set({
            status,
            awbCode: existing.awbCode,
            courierId: existing.courierId ?? shipment.courierId,
            courierName: existing.courierName ?? shipment.courierName,
            trackingUrl: existing.trackingUrl ?? shipment.trackingUrl,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
      } catch (error) {
        logger.warn({
          checkoutOrderId: row.cashfreeOrderId,
          shipmentPackageId: shipment.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }, "Existing Shiprocket assignment could not be reconciled");
      }
      continue;
    }
    if (shipment.status !== "quoted") continue;
    const [claimed] = await db.update(checkoutShipmentPackagesTable)
      .set({ status: "booking_pending", lastError: null, updatedAt: new Date() })
      .where(and(
        eq(checkoutShipmentPackagesTable.id, shipment.id),
        eq(checkoutShipmentPackagesTable.status, "quoted"),
      ))
      .returning();
    if (!claimed) continue;
    try {
      let shipmentId = shipment.shiprocketShipmentId;
      if (!shipmentId && !shipment.shiprocketOrderId) {
        const snapshot = snapshotFromRow(row);
        const input = buildProviderPackageInputs({
          quoteId: row.id,
          cart: snapshot.cart,
          address: snapshot.address,
          email: snapshot.email,
          phone: snapshot.phone,
          countryName: new Intl.DisplayNames(["en"], { type: "region" })
            .of(row.destinationCountryCode) ?? row.destinationCountryCode,
        })[shipment.packageIndex];
        if (!input) throw new ShiprocketError("Paid parcel details are unavailable.");
        const created = await createShiprocketPackage(input);
        shipmentId = created.shipmentId;
        await db.update(checkoutShipmentPackagesTable)
          .set({
            shiprocketOrderId: created.orderId,
            shiprocketShipmentId: created.shipmentId,
            updatedAt: new Date(),
          })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
      }
      if (!shipmentId) {
        await db.update(checkoutShipmentPackagesTable)
          .set({
            status: "booking_pending",
            lastError: "The existing Shiprocket shipment reference could not be confirmed.",
            updatedAt: new Date(),
          })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
        continue;
      }
      if (!allowAwb) {
        await db.update(checkoutShipmentPackagesTable)
          .set({ status: "quoted", updatedAt: new Date() })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
        continue;
      }
      const existing = await getShiprocketShipmentDetails(shipmentId);
      if (existing.awbCode) {
        const providerStatus = shipmentLifecycleFromTracking(existing.status, null);
        await db.update(checkoutShipmentPackagesTable)
          .set({
            status: advanceShipmentLifecycle("booked", providerStatus, true),
            awbCode: existing.awbCode,
            courierId: existing.courierId ?? shipment.courierId,
            courierName: existing.courierName ?? shipment.courierName,
            trackingUrl: existing.trackingUrl ?? shipment.trackingUrl,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
        continue;
      }
      const booked = await bookShiprocketPackage({
        shipmentId,
        courierId: shipment.courierId,
        international: row.destinationCountryCode !== "IN",
      });
      await db.update(checkoutShipmentPackagesTable)
        .set({
          status: "booked",
          awbCode: booked.awbCode,
          courierId: booked.courierId ?? shipment.courierId,
          courierName: booked.courierName ?? shipment.courierName,
          trackingUrl: booked.trackingUrl ?? existing.trackingUrl ?? shipment.trackingUrl,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
    } catch (error) {
      const httpStatus = error instanceof ShiprocketError
        ? error.diagnostics.httpStatus
        : undefined;
      const diagnostics = error instanceof ShiprocketError ? error.diagnostics : undefined;
      const definitelyRejected = diagnostics?.bookingRejected === true ||
        (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500 &&
          httpStatus !== 408 && httpStatus !== 409);
      logger.error({
        checkoutOrderId: row.cashfreeOrderId,
        shipmentPackageId: shipment.id,
        providerHttpStatus: httpStatus,
        providerErrorCode: diagnostics?.errorCode,
        providerMessage: diagnostics?.message,
      }, "Paid checkout carrier booking did not complete");
      await db.update(checkoutShipmentPackagesTable)
        .set({
          status: definitelyRejected ? "booking_failed" : "booking_pending",
          lastError: definitelyRejected
            ? `Shiprocket rejected AWB assignment. ${diagnostics?.message ?? ""} Verify courier eligibility before retrying.`.trim()
            : "Shiprocket may have accepted the request. Reconcile shipment details before any retry.",
          updatedAt: new Date(),
        })
        .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
    }
  }
  const updatedPackages = await db.select()
    .from(checkoutShipmentPackagesTable)
    .where(eq(checkoutShipmentPackagesTable.checkoutOrderId, row.id));
  const allBooked = updatedPackages.length > 0 &&
    updatedPackages.every((shipment) =>
      Boolean(shipment.awbCode) &&
      ["booked", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered", "returned"]
        .includes(shipment.status),
    );
  const needsReconciliation = updatedPackages.some((shipment) =>
    shipment.status === "booking_failed" ||
    shipment.status === "failed" ||
    (isShipmentBookedOrBeyond(shipment.status) && !shipment.awbCode) ||
    (shipment.status === "booking_pending" && shipment.updatedAt.getTime() <= retryAfter.getTime()),
  );
  const [updated] = await db.update(cashfreeCheckoutOrdersTable)
    .set({
      status: allBooked
        ? "completed"
        : needsReconciliation
          ? "reconciliation_required"
          : "shipment_booking_pending",
      lastError: allBooked
        ? null
        : needsReconciliation
          ? "Verify Shiprocket booking state before any manual retry."
          : "One or more carrier packages are still pending.",
      ...(updatedPackages.length > 0 &&
        updatedPackages.every((shipment) => shipment.shiprocketOrderId && shipment.shiprocketShipmentId)
        ? { checkoutSnapshot: ownershipSnapshot(row) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(cashfreeCheckoutOrdersTable.id, row.id))
    .returning();
  return updated ?? row;
}

async function processConfirmedPayment(
  orderId: string,
  preferredReference?: string | null,
): Promise<CheckoutOrderRow | null> {
  const [row] = await db.select()
    .from(cashfreeCheckoutOrdersTable)
    .where(eq(cashfreeCheckoutOrdersTable.cashfreeOrderId, orderId))
    .limit(1);
  if (!row) return null;
  if (["refund_pending", "refunded", "reconciliation_required"].includes(row.status)) return row;
  const remoteOrder = await getCashfreeOrder(row.cashfreeOrderId);
  if (
    remoteOrder.order_currency !== row.currencyCode ||
    moneyForCashfree(String(remoteOrder.order_amount)) !== moneyForCashfree(row.totalAmount)
  ) {
    await db.update(cashfreeCheckoutOrdersTable)
      .set({
        status: "reconciliation_required",
        paymentStatus: "reconciliation_required",
        lastError: "Cashfree order amount or currency does not match the saved quote.",
        updatedAt: new Date(),
      })
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id));
    return (await db.select().from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id)).limit(1))[0] ?? null;
  }
  if (remoteOrder.order_status.toUpperCase() !== "PAID") {
    const outcome = ["ACTIVE", "PENDING"].includes(remoteOrder.order_status.toUpperCase())
      ? await getCashfreePaymentOutcome(row.cashfreeOrderId)
      : null;
    if (["EXPIRED", "TERMINATED", "FAILED"].includes(remoteOrder.order_status.toUpperCase()) ||
        outcome === "FAILED" || outcome === "USER_DROPPED") {
      await db.update(cashfreeCheckoutOrdersTable)
        .set({
          status: "payment_failed",
          paymentStatus: "failed",
          lastError: outcome === "USER_DROPPED"
            ? "The payment was closed before completion. No paid order was created; recheck the status before retrying."
            : null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(cashfreeCheckoutOrdersTable.id, row.id),
          or(
            eq(cashfreeCheckoutOrdersTable.status, "payment_pending"),
            eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
            eq(cashfreeCheckoutOrdersTable.status, "payment_failed"),
          ),
        ));
    }
    return (await db.select().from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, row.id)).limit(1))[0] ?? null;
  }
  const paymentReference =
    preferredReference ||
    row.paymentReference ||
    await getCashfreePaymentReference(row.cashfreeOrderId).catch(() => null) ||
    remoteOrder.cf_order_id ||
    row.cashfreeOrderId;
  const synced = await syncShopifyOrder(row.cashfreeOrderId, paymentReference);
  if (!synced) return null;
  if (synced.status === "shipment_booking_pending") {
    return bookQuotedShipments(synced);
  }
  return synced;
}

function validateCartForCheckout(cart: ShopifyCartNode): void {
  if (!cart.lines.nodes.length || cart.totalQuantity < 1) {
    throw new ShopifyCheckoutInputError("Your Shopify bag is empty.", 400);
  }
  if (cart.totalQuantity > 20) {
    throw new ShopifyCheckoutInputError(
      "This checkout supports up to 20 individually packed items per order.",
      422,
    );
  }
  for (const line of cart.lines.nodes) {
    const product = line.merchandise?.product;
    if (!line.merchandise || !line.merchandise.availableForSale || !product) {
      throw new ShopifyCheckoutInputError(
        "A product in your bag is no longer available. Refresh your bag and try again.",
        409,
      );
    }
    if (/\b(demo|sample|template)\b/i.test(
      [product.title, product.description, ...product.tags].join(" "),
    )) {
      throw new ShopifyCheckoutInputError(
        "A sample listing cannot be purchased. Remove it from your bag and try again.",
        409,
      );
    }
  }
  if (cart.cost.totalAmount.currencyCode !== "INR") {
    throw new ShopifyCheckoutInputError(
      "This checkout currently supports INR only. The Shopify cart currency must be INR.",
      422,
    );
  }
}

function buildProviderPackageInputs(input: {
  quoteId: string;
  cart: ShopifyCartNode;
  address: CheckoutAddress;
  email: string;
  phone: string;
  countryName: string;
}) {
  const parcel = getConfiguredParcel();
  const prefix = `cfq_${input.quoteId.replace(/-/g, "")}`;
  let packageIndex = 0;
  const packages = input.cart.lines.nodes.flatMap((line) => {
    const merchandise = line.merchandise!;
    const mode = getShiprocketModeForProductTags(merchandise.product.tags);
    const unitPrices = splitMoney(line.cost.totalAmount.amount, line.quantity);
    return unitPrices.map((sellingPrice) => ({
      orderId: `${prefix}_p${packageIndex}`,
      packageIndex: packageIndex++,
      destination: {
        recipient: input.address.recipient,
        street: input.address.street,
        ...(input.address.address2 ? { address2: input.address.address2 } : {}),
        city: input.address.city,
        ...(input.address.state ? { state: input.address.state } : {}),
        postalCode: input.address.pin,
        countryCode: input.address.countryCode,
        countryName: input.countryName,
      },
      email: input.email,
      phone: input.phone,
      productName: `${merchandise.product.title} - ${merchandise.title}`,
      sku: merchandise.sku || merchandise.id.split("/").at(-1) || merchandise.id,
      sellingPrice,
      currencyCode: input.cart.cost.totalAmount.currencyCode,
      hsnCode: process.env.SHIPROCKET_HSN_CODE?.trim(),
      ...(mode ? { mode } : {}),
      ...parcel,
    }));
  });
  return packages;
}

router.post("/shopify/checkout/quote", async (req, res): Promise<void> => {
  const shopperUserId = requireCheckoutUser(req, res);
  if (!shopperUserId) return;
  const parsed = CreateShopifyCheckoutQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid contact and delivery details." });
    return;
  }
  if (!parsed.data.phone?.trim()) {
    res.status(400).json({ error: "Enter a phone number for your secure payment and delivery." });
    return;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(parsed.data.phone.trim())) {
    res.status(400).json({ error: "Enter a valid international phone number with country code." });
    return;
  }
  if (!allowRequest(quoteAttempts, requestIp(req), 6)) {
    res.status(429).json({ error: "Too many quote requests. Please wait a minute and try again." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    await assertRailwayShopifyStore();
    const now = new Date();
    const expiredQuotes = await db.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(and(
        eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
        lt(cashfreeCheckoutOrdersTable.quoteExpiresAt, now),
      ));
    for (const expiredQuote of expiredQuotes) {
      await db.update(cashfreeCheckoutOrdersTable)
        .set({
          status: "payment_failed",
          checkoutSnapshot: ownershipSnapshot(expiredQuote),
          lastError: "Shipping quote expired before payment.",
          updatedAt: now,
        })
        .where(and(
          eq(cashfreeCheckoutOrdersTable.id, expiredQuote.id),
          eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
          lt(cashfreeCheckoutOrdersTable.quoteExpiresAt, now),
        ));
    }
    const address = {
      ...parsed.data.deliveryAddress,
      countryCode: parsed.data.deliveryAddress.countryCode.toUpperCase(),
    };
    const [cart, countries] = await Promise.all([
      prepareShopifyCheckoutCart({ ...parsed.data, deliveryAddress: address }),
      getAvailableCountries(),
    ]);
    validateCartForCheckout(cart);
    const country = countries.find((item) => item.isoCode === address.countryCode);
    if (!country) {
      res.status(409).json({ error: "This store is not currently set up to deliver to the selected country." });
      return;
    }
    const parcel = getConfiguredParcel();
    const quoteFingerprint = checkoutCartFingerprint({
      cart,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address,
      parcel,
    });
    const quoteHash = getShopperQuoteHash(shopperUserId, quoteFingerprint);
    const existing = await db.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(and(
        eq(cashfreeCheckoutOrdersTable.quoteHash, quoteHash),
        gt(cashfreeCheckoutOrdersTable.quoteExpiresAt, new Date(Date.now() + 20 * 60 * 1000)),
        or(
          eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
          eq(cashfreeCheckoutOrdersTable.status, "payment_pending"),
        ),
      ))
      .orderBy(desc(cashfreeCheckoutOrdersTable.createdAt))
      .limit(1);
    if (existing[0]) {
      res.json(responseForQuote(existing[0]));
      return;
    }

    const quoteId = randomUUID();
    const packages = buildProviderPackageInputs({
      quoteId,
      cart,
      address,
      email: parsed.data.email,
      phone: parsed.data.phone,
      countryName: country.name,
    });
    const providerPackages: ShiprocketQuote[] = [];
    for (const packageInput of packages) {
      providerPackages.push(await quoteShiprocketPackage(packageInput));
    }
    const currencyCode = cart.cost.totalAmount.currencyCode;
    if (providerPackages.some((item) => item.currencyCode !== currencyCode)) {
      res.status(422).json({
        error: "Shiprocket returned a shipping amount in a different currency from the Shopify bag.",
      });
      return;
    }
    const shippingAmount = addMoney(providerPackages.map(({ amount }) => amount));
    const itemTotal = getCheckoutItemTotal(cart);
    const taxAmount = "0.00";
    const totalAmount = addMoney([itemTotal, shippingAmount]);
    const quoteExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const courierNames = [...new Set(providerPackages.map(({ courierName }) => courierName))];
    const courierName = courierNames.join(", ");
    const snapshot: CheckoutSnapshot = {
      shopperUserId,
      email: parsed.data.email.trim(),
      phone: parsed.data.phone.trim(),
      address,
      cart: minimalCartSnapshot(cart),
      providerPackages,
      courierName,
      parcelCount: providerPackages.length,
    };
    const cashfreeOrderId = `chenetha_${quoteId.replace(/-/g, "")}`;
    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(cashfreeCheckoutOrdersTable).values({
        id: quoteId,
        cashfreeOrderId,
        status: "quote_ready",
        quoteHash,
        cartId: cart.id,
        destinationCountryCode: address.countryCode,
        currencyCode,
        itemSubtotal: cart.cost.subtotalAmount.amount,
        discountAmount: getCartDiscountAmount(cart),
        shippingAmount,
        taxAmount,
        totalAmount,
        quoteExpiresAt,
        checkoutSnapshot: snapshot,
      }).returning();
      if (!inserted) throw new Error("Checkout quote could not be saved.");
      await tx.insert(checkoutShipmentPackagesTable).values(providerPackages.map((item, packageIndex) => ({
        checkoutOrderId: quoteId,
        packageIndex,
        courierId: item.courierId,
        courierName: item.courierName,
        quotedAmount: item.amount,
        status: "quoted" as const,
      })));
      return inserted;
    });
    res.json(responseForQuote(row));
  } catch (error) {
    if (error instanceof ShopifyCheckoutInputError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof ShiprocketError) {
      logger.warn({
        shiprocketEndpoint: error.diagnostics.endpoint,
        shiprocketHttpStatus: error.diagnostics.httpStatus,
        shiprocketErrorCode: error.diagnostics.errorCode,
        shiprocketMessage: error.diagnostics.message,
      }, "Shiprocket checkout quote failed");
      const needsConfiguration = /not configured|no configured pickup|invoice terms|export purpose|HSN code/i.test(error.message);
      const noRoute = /no serviceable courier|not serviceable/i.test(error.message);
      const noSurfaceRoute = /no serviceable Surface courier/i.test(error.message);
      res.status(needsConfiguration ? 422 : 409).json({
        error: needsConfiguration
          ? "The shipping account or product export settings are incomplete for this destination."
          : noSurfaceRoute
            ? error.message
          : noRoute
            ? "The carrier has no serviceable route for this delivery address."
            : "Shiprocket could not confirm a current quote. No payment was taken.",
      });
      return;
    }
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Cashfree checkout quote could not be created");
    res.status(502).json({
      error: "A current shipping quote could not be confirmed. Your bag has not been charged.",
    });
  }
});

router.post("/shopify/checkout/payment-session", async (req, res): Promise<void> => {
  const shopperUserId = requireCheckoutUser(req, res);
  if (!shopperUserId) return;
  const parsed = CreateShopifyCheckoutPaymentSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid shipping quote is required before payment." });
    return;
  }
  if (!allowRequest(sessionAttempts, requestIp(req), 6)) {
    res.status(429).json({ error: "Too many payment attempts. Please wait a minute and try again." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const [row] = await db.select()
    .from(cashfreeCheckoutOrdersTable)
    .where(eq(cashfreeCheckoutOrdersTable.id, parsed.data.quoteId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "This shipping quote could not be found. Request a new quote." });
    return;
  }
  if (!await checkoutBelongsToShopper(row, shopperUserId)) {
    res.status(404).json({ error: "This shipping quote could not be found. Request a new quote." });
    return;
  }
  if (row.quoteExpiresAt.getTime() <= Date.now()) {
    res.status(409).json({ error: "This shipping quote expired. Request a fresh quote before payment." });
    return;
  }
  try {
    assertCashfreeLiveReadiness(row.currencyCode, row.destinationCountryCode !== "IN");
  } catch (error) {
    if (error instanceof CashfreeError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (row.status === "payment_pending" && row.paymentSessionId) {
    res.json(CreateShopifyCheckoutPaymentSessionResponse.parse({
      orderId: row.cashfreeOrderId,
      paymentSessionId: row.paymentSessionId,
      amount: row.totalAmount,
      currencyCode: row.currencyCode,
      environment: getCashfreeEnvironment(),
    }));
    return;
  }
  if (row.status !== "quote_ready") {
    res.status(409).json({ error: "This quote is no longer available. Request a fresh quote." });
    return;
  }
  try {
    const snapshot = snapshotFromRow(row);
    await assertRailwayShopifyStore();
    const cart = await prepareShopifyCheckoutCart({
      cartId: row.cartId,
      email: snapshot.email,
      phone: snapshot.phone,
      deliveryAddress: snapshot.address,
    });
    validateCartForCheckout(cart);
    const currentFingerprint = checkoutCartFingerprint({
      cart,
      email: snapshot.email,
      phone: snapshot.phone,
      address: snapshot.address,
      parcel: getConfiguredParcel(),
    });
    const currentQuoteHash = getShopperQuoteHash(shopperUserId, currentFingerprint);
    if (currentQuoteHash !== row.quoteHash) {
      res.status(409).json({
        error: "Your bag, delivery address, or parcel setup changed. Request a fresh shipping quote.",
      });
      return;
    }
    await assertShopifyCheckoutCapabilities();
    // Cashfree's session must expire no later than the rate we are charging.
    if (row.quoteExpiresAt.getTime() <= Date.now() + 20 * 60 * 1000) {
      res.status(409).json({ error: "This shipping quote expires too soon. Request a fresh quote before payment." });
      return;
    }
    const cashfreeExpiryMs = Math.min(
      Date.now() + 20 * 60 * 1000,
      row.quoteExpiresAt.getTime(),
    );
    const cashfreeOrder = await createCashfreeOrder({
      orderId: row.cashfreeOrderId,
      amount: moneyForCashfree(row.totalAmount),
      currencyCode: row.currencyCode,
      email: snapshot.email,
      phone: snapshot.phone,
      returnUrl: cashfreeReturnUrl(row.cashfreeOrderId, req),
      expiresAt: new Date(cashfreeExpiryMs).toISOString(),
      idempotencyKey: row.id,
      isInternational: row.destinationCountryCode !== "IN",
    });
    await db.update(cashfreeCheckoutOrdersTable)
      .set({
        status: "payment_pending",
        paymentStatus: "pending",
        paymentSessionId: cashfreeOrder.payment_session_id,
        lastError: null,
      })
      .where(and(
        eq(cashfreeCheckoutOrdersTable.id, row.id),
        eq(cashfreeCheckoutOrdersTable.status, "quote_ready"),
      ));
    res.json(CreateShopifyCheckoutPaymentSessionResponse.parse({
      orderId: cashfreeOrder.order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      amount: row.totalAmount,
      currencyCode: row.currencyCode,
      environment: getCashfreeEnvironment(),
    }));
  } catch (error) {
    if (error instanceof CashfreeError) {
      if (error.upstreamStatus !== undefined) {
        logger.error({
          checkoutOrderId: row.cashfreeOrderId,
          cashfreeHttpStatus: error.upstreamStatus,
          cashfreeErrorCode: error.providerCode ?? null,
          cashfreeErrorType: error.providerType ?? null,
          cashfreeErrorMessage: error.providerMessage ?? null,
          createOrderRequest: error.createOrderRequest ?? null,
        }, "Cashfree Create Order API rejected the checkout request");
      }
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof ShopifyCheckoutInputError || error instanceof ShopifyCheckoutSyncError) {
      res.status(error instanceof ShopifyCheckoutInputError ? error.statusCode : 503)
        .json({ error: error.message });
      return;
    }
    logger.error({
      checkoutOrderId: row.cashfreeOrderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Cashfree session could not be created");
    res.status(503).json({
      error: "Secure payment is temporarily unavailable. Your bag has not been charged.",
    });
  }
});

router.get("/shopify/checkout/payment-status", async (req, res): Promise<void> => {
  const shopperUserId = requireCheckoutUser(req, res);
  if (!shopperUserId) return;
  const parsed = GetShopifyCheckoutPaymentStatusQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid Cashfree order reference is required." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    let [row] = await db.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.cashfreeOrderId, parsed.data.orderId))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Checkout order was not found." });
      return;
    }
    if (!await checkoutBelongsToShopper(row, shopperUserId)) {
      res.status(404).json({ error: "Checkout order was not found." });
      return;
    }
    if (
      row.status === "payment_pending" ||
      row.status === "quote_ready" ||
      row.status === "payment_failed" ||
      row.status === "paid" ||
      row.status === "shopify_sync_pending" ||
      row.status === "shipment_booking_pending"
    ) {
      row = await processConfirmedPayment(row.cashfreeOrderId) ?? row;
    }
    res.json(GetShopifyCheckoutPaymentStatusResponse.parse({
      orderId: row.cashfreeOrderId,
      status: row.status,
      paymentStatus: paymentStatusForOrder(row.paymentStatus),
      shopifyOrderName: row.shopifyOrderName,
      message: messageForOrder(row),
    }));
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Cashfree payment status could not be verified");
    res.status(503).json({
      error: "Payment status is temporarily unavailable. Do not submit another payment.",
    });
  }
});

router.post("/cashfree/webhook", async (req, res): Promise<void> => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  const signature = req.header("x-webhook-signature");
  const timestamp = req.header("x-webhook-timestamp");
  if (
    !rawBody ||
    !signature ||
    !timestamp ||
    !verifyCashfreeWebhookSignature({ rawBody, signature, timestamp })
  ) {
    res.status(401).json({ error: "Invalid Cashfree webhook signature." });
    return;
  }
  let event: {
    type?: string;
    data?: {
      order?: { order_id?: string };
      order_id?: string;
      payment?: { cf_payment_id?: string | number };
      refund?: { refund_status?: string };
    };
  };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid Cashfree webhook payload." });
    return;
  }
  const orderId = event.data?.order?.order_id ?? event.data?.order_id;
  if (!orderId) {
    res.status(400).json({ error: "Cashfree webhook is missing an order reference." });
    return;
  }
  const [row] = await db.select()
    .from(cashfreeCheckoutOrdersTable)
    .where(eq(cashfreeCheckoutOrdersTable.cashfreeOrderId, orderId))
    .limit(1);
  if (!row) {
    logger.warn({ checkoutOrderId: orderId }, "Verified Cashfree webhook did not match a local checkout");
    res.status(404).json({ error: "Checkout order was not found." });
    return;
  }
  if ((event.type ?? "").toUpperCase().includes("REFUND")) {
    const providerStatus = (event.data?.refund?.refund_status ?? "").toUpperCase();
    const status = providerStatus === "SUCCESS"
      ? "refunded"
      : providerStatus === "PENDING"
        ? "refund_pending"
        : "reconciliation_required";
    if (row.status !== "refunded") {
      await db.update(cashfreeCheckoutOrdersTable)
        .set({
          status,
          paymentStatus: status,
          checkoutSnapshot: ownershipSnapshot(row),
          lastError: status === "refunded"
            ? "Cashfree refund confirmed; verify the refund is represented in Shopify."
            : status === "refund_pending"
              ? "Cashfree refund is pending; verify its final status before updating Shopify."
              : "Cashfree refund needs merchant and Shopify reconciliation.",
          updatedAt: new Date(),
        })
        .where(and(
          eq(cashfreeCheckoutOrdersTable.id, row.id),
          or(
            eq(cashfreeCheckoutOrdersTable.status, "payment_pending"),
            eq(cashfreeCheckoutOrdersTable.status, "payment_failed"),
            eq(cashfreeCheckoutOrdersTable.status, "paid"),
            eq(cashfreeCheckoutOrdersTable.status, "shopify_sync_pending"),
            eq(cashfreeCheckoutOrdersTable.status, "shopify_synced"),
            eq(cashfreeCheckoutOrdersTable.status, "shipment_booking_pending"),
            eq(cashfreeCheckoutOrdersTable.status, "completed"),
            eq(cashfreeCheckoutOrdersTable.status, "refund_pending"),
          ),
        ));
      logger.warn({
        checkoutOrderId: orderId,
        refundStatus: status,
        shopifyOrderId: row.shopifyOrderId,
      }, "Cashfree refund needs Shopify payment reconciliation");
    }
    res.status(200).json({ received: true });
    return;
  }
  try {
    await processConfirmedPayment(
      orderId,
      event.data?.payment?.cf_payment_id === undefined
        ? undefined
        : String(event.data.payment.cf_payment_id),
    );
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({
      checkoutOrderId: orderId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Cashfree webhook could not be reconciled");
    res.status(503).json({ error: "Cashfree webhook reconciliation will be retried." });
  }
});

export default router;
