import { createHash, timingSafeEqual } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetShopifyOrderDetailsParams,
  GetShopifyOrderDetailsResponse,
  GetShopifyOrderTrackingParams,
  GetShopifyOrderTrackingResponse,
  GetShopifyOrdersQueryParams,
  GetShopifyOrdersResponse,
} from "@workspace/api-zod";
import {
  cashfreeCheckoutOrdersTable,
  checkoutShipmentPackagesTable,
  db,
} from "@workspace/db";
import {
  advanceShipmentLifecycle,
  isShipmentBookedOrBeyond,
  isShipmentProgressStatus,
  normalizeShipmentLifecycleStatus,
  shipmentLifecycleFromTracking,
  shipmentLifecycleLabel,
  type ShipmentLifecycleStatus,
} from "../lib/shipmentLifecycle";
import { shopifyAdminRequest } from "../lib/shopifyAdminClient";
import {
  getShiprocketTracking,
  mergeShiprocketTrackingSnapshot,
  parseShiprocketTrackingWebhook,
  type ShiprocketTracking,
} from "../lib/shiprocketClient";
import { logger } from "../lib/logger";

type ShopifyMoney = { amount?: string | null; currencyCode?: string | null };
type ShopifyMoneySet = { shopMoney?: ShopifyMoney | null } | null;
type ShopifyOrderLine = {
  id: string;
  title: string;
  variantTitle?: string | null;
  sku?: string | null;
  quantity: number;
  originalUnitPriceSet?: ShopifyMoneySet;
  discountedTotalSet?: ShopifyMoneySet;
  image?: { url?: string | null; altText?: string | null } | null;
};
type ShopifyTrackingInfo = {
  company?: string | null;
  number?: string | null;
  url?: string | null;
};
type ShopifyFulfillment = {
  status?: string | null;
  estimatedDeliveryAt?: string | null;
  trackingInfo?: ShopifyTrackingInfo[] | null;
};
type ShopifyOrderNode = {
  id: string;
  name: string;
  email?: string | null;
  createdAt: string;
  processedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  totalPriceSet?: ShopifyMoneySet;
  currentTotalPriceSet?: ShopifyMoneySet;
  lineItems: { nodes: ShopifyOrderLine[] };
  fulfillments?: ShopifyFulfillment[] | null;
};
type ShopifyOrdersPage = {
  orders: {
    nodes: ShopifyOrderNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};
type ShopifyOrderResult = { node: ShopifyOrderNode | null };

const router: IRouter = Router();
const LIST_ORDERS_QUERY = `#graphql
  query ShopperShopifyOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        email
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 8) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedTotalSet { shopMoney { amount currencyCode } }
            image { url altText }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_DETAILS_QUERY = `#graphql
  query ShopperShopifyOrder($id: ID!) {
    node(id: $id) {
      ... on Order {
        id
        name
        email
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 100) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedTotalSet { shopMoney { amount currencyCode } }
            image { url altText }
          }
        }
        fulfillments {
          status
          estimatedDeliveryAt
          trackingInfo { company number url }
        }
      }
    }
  }
`;

function requireUserId(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view your orders." });
    return null;
  }
  return userId;
}

async function getVerifiedEmails(userId: string): Promise<string[]> {
  const user = await clerkClient.users.getUser(userId);
  return [...new Set(user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase())
    .filter(Boolean))];
}

function orderSearchQuery(emails: string[]): string {
  return emails.map((email) => `email:${JSON.stringify(email)}`).join(" OR ");
}

function orderRefForId(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function shopifyOrderIdForRef(orderRef: string): string | null {
  try {
    const id = Buffer.from(orderRef, "base64url").toString("utf8");
    return /^gid:\/\/shopify\/Order\/\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function emailMatchesOrder(order: ShopifyOrderNode, emails: Set<string>): boolean {
  const email = order.email;
  return typeof email === "string" && emails.has(email.trim().toLowerCase());
}

function amountFrom(set: ShopifyMoneySet | undefined | null): string | null {
  const amount = set?.shopMoney?.amount;
  return typeof amount === "string" && Number.isFinite(Number(amount)) ? amount : null;
}

function currencyFrom(set: ShopifyMoneySet | undefined | null): string | null {
  const currency = set?.shopMoney?.currencyCode;
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function mapLineItem(line: ShopifyOrderLine, orderCurrency: string) {
  const unitPrice = amountFrom(line.originalUnitPriceSet) ?? "0.00";
  const totalPrice = amountFrom(line.discountedTotalSet) ??
    (Number(unitPrice) * Math.max(1, line.quantity)).toFixed(2);
  const image = line.image?.url && isSafeHttpsUrl(line.image.url)
    ? { url: line.image.url, altText: line.image.altText ?? null }
    : null;
  return {
    id: line.id,
    title: line.title,
    variantTitle: line.variantTitle ?? null,
    sku: line.sku ?? null,
    quantity: Math.max(1, line.quantity),
    unitPrice,
    totalPrice,
    currencyCode: currencyFrom(line.originalUnitPriceSet) ?? orderCurrency,
    image,
  };
}

function mapOrderSummary(order: ShopifyOrderNode) {
  const totalSet = order.currentTotalPriceSet ?? order.totalPriceSet;
  const currencyCode = currencyFrom(totalSet) ?? "INR";
  const isPaid = order.displayFinancialStatus?.toUpperCase() === "PAID";
  return {
    orderRef: orderRefForId(order.id),
    name: order.name,
    createdAt: order.createdAt,
    processedAt: order.processedAt ?? null,
    financialStatus: order.displayFinancialStatus ?? "UNKNOWN",
    // A Shopify fulfillment must not make an unpaid order look shipped.
    fulfillmentStatus: isPaid ? order.displayFulfillmentStatus ?? null : null,
    totalAmount: amountFrom(totalSet) ?? "0.00",
    currencyCode,
    lineItems: order.lineItems.nodes.map((line) => mapLineItem(line, currencyCode)),
  };
}

function mapOrderDetails(order: ShopifyOrderNode) {
  return {
    ...mapOrderSummary(order),
    fulfillments: order.displayFinancialStatus?.toUpperCase() === "PAID"
      ? (order.fulfillments ?? []).map((fulfillment) => {
      const tracking = fulfillment.trackingInfo?.[0];
      return {
        status: fulfillment.status ?? "UNKNOWN",
        trackingCompany: tracking?.company ?? null,
        trackingNumber: tracking?.number ?? null,
        trackingUrl: tracking?.url && isSafeHttpsUrl(tracking.url) ? tracking.url : null,
        estimatedDeliveryAt: fulfillment.estimatedDeliveryAt ?? null,
      };
      })
      : [],
  };
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseTrackingDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function refreshStoredShipmentTracking(
  shipmentPackageId: string,
  expectedAwbCode: string,
): Promise<ShiprocketTracking | null> {
  const incoming = await getShiprocketTracking(expectedAwbCode);
  return persistStoredShipmentTracking(shipmentPackageId, incoming, { awbCode: expectedAwbCode });
}

async function persistStoredShipmentTracking(
  shipmentPackageId: string,
  incoming: ShiprocketTracking,
  expected: { awbCode?: string | null; shipmentId?: string | null; orderId?: string | null },
): Promise<(ShiprocketTracking & { shipmentStatus: ShipmentLifecycleStatus }) | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select()
      .from(checkoutShipmentPackagesTable)
      .where(eq(checkoutShipmentPackagesTable.id, shipmentPackageId))
      .limit(1)
      .for("update");
    if (!current) return null;
    if (expected.awbCode && current.awbCode && current.awbCode.toUpperCase() !== expected.awbCode.toUpperCase()) {
      return null;
    }
    if (expected.shipmentId && current.shiprocketShipmentId &&
        current.shiprocketShipmentId !== expected.shipmentId) return null;
    if (expected.orderId && current.shiprocketOrderId &&
        current.shiprocketOrderId !== expected.orderId) return null;

    const [checkout] = await tx.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, current.checkoutOrderId))
      .limit(1)
      .for("update");
    if (
      !checkout ||
      checkout.paymentStatus !== "paid" ||
      !checkout.shopifyOrderId ||
      ["refund_pending", "refunded", "reconciliation_required"].includes(checkout.status)
    ) return null;

    const merged = mergeShiprocketTrackingSnapshot({
      status: current.trackingStatus,
      events: current.trackingEvents ?? [],
    }, incoming);
    const incomingLifecycle = shipmentLifecycleFromTracking(
      merged.status,
      merged.statusCode,
    );
    const hasConfirmedAwb = Boolean(current.awbCode || incoming.awbCode);
    const lifecycleStatus = advanceShipmentLifecycle(
      current.status,
      incomingLifecycle,
      hasConfirmedAwb,
    );
    if (
      isShipmentProgressStatus(incomingLifecycle) &&
      !hasConfirmedAwb
    ) return null;
    const trackingUrl = incoming.trackingUrl ?? current.trackingUrl;
    const estimatedDeliveryAt = incoming.estimatedDeliveryAt
      ? new Date(incoming.estimatedDeliveryAt)
      : current.estimatedDeliveryAt;
    const now = new Date();
    await tx.update(checkoutShipmentPackagesTable)
      .set({
        awbCode: current.awbCode ?? (incoming.awbCode || null),
        status: lifecycleStatus,
        courierName: incoming.courierName ?? current.courierName,
        trackingStatus: merged.status,
        trackingEvents: merged.events,
        trackingUrl,
        estimatedDeliveryAt,
        trackingUpdatedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(checkoutShipmentPackagesTable.id, current.id));

    return {
      ...incoming,
      status: merged.status,
      shipmentStatus: lifecycleStatus,
      awbCode: incoming.awbCode || current.awbCode || "",
      courierName: incoming.courierName ?? current.courierName,
      trackingUrl,
      estimatedDeliveryAt: estimatedDeliveryAt?.toISOString() ?? null,
      events: merged.events,
    };
  });
}

function validShiprocketWebhookKey(received: string | undefined): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_SECRET?.trim();
  const provided = received?.trim();
  if (!expected || !provided) return false;
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function validTrackingAwb(value: string): boolean {
  return /^[A-Za-z0-9-]{4,40}$/.test(value);
}

function orderRefFromParams(req: Request): string | null {
  const parsed = GetShopifyOrderDetailsParams.safeParse(req.params);
  return parsed.success ? parsed.data.orderRef : null;
}

async function loadOwnedOrder(orderRef: string, emails: Set<string>): Promise<ShopifyOrderNode | null> {
  const id = shopifyOrderIdForRef(orderRef);
  if (!id) return null;
  const result = await shopifyAdminRequest<OrderShopifyResult>(
    ORDER_DETAILS_QUERY,
    { id },
  );
  const order = result.node;
  return order && emailMatchesOrder(order, emails) ? order : null;
}

type OrderShopifyResult = ShopifyOrderResult;

function setAuthHeaders(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

async function verifiedEmailsOrRespond(
  userId: string,
  res: Response,
): Promise<Set<string> | null> {
  try {
    const emails = await getVerifiedEmails(userId);
    if (!emails.length) {
      res.status(403).json({ error: "Add and verify an email address to view orders." });
      return null;
    }
    return new Set(emails);
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Verified shopper email could not be loaded for order access");
    res.status(503).json({ error: "Your order history is temporarily unavailable." });
    return null;
  }
}

router.get("/shopify/orders", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const params = GetShopifyOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "A valid order-history cursor is required." });
    return;
  }
  const emails = await verifiedEmailsOrRespond(userId, res);
  if (!emails) return;

  try {
    const result = await shopifyAdminRequest<ShopifyOrdersPage>(LIST_ORDERS_QUERY, {
      first: 25,
      after: params.data.after ?? null,
      query: orderSearchQuery([...emails]),
    });
    const orders = result.orders.nodes
      .filter((order) => emailMatchesOrder(order, emails))
      .map(mapOrderSummary);
    setAuthHeaders(res);
    res.json(GetShopifyOrdersResponse.parse({
      orders,
      nextCursor: result.orders.pageInfo.hasNextPage
        ? result.orders.pageInfo.endCursor
        : null,
    }));
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Shopper Shopify orders could not be loaded");
    res.status(502).json({ error: "Your Shopify order history is temporarily unavailable." });
  }
});

router.get("/shopify/orders/:orderRef", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const orderRef = orderRefFromParams(req);
  if (!orderRef) {
    res.status(404).json({ error: "This order could not be found." });
    return;
  }
  const emails = await verifiedEmailsOrRespond(userId, res);
  if (!emails) return;

  try {
    const order = await loadOwnedOrder(orderRef, emails);
    if (!order) {
      res.status(404).json({ error: "This order could not be found." });
      return;
    }
    setAuthHeaders(res);
    res.json(GetShopifyOrderDetailsResponse.parse({ order: mapOrderDetails(order) }));
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Shopper Shopify order details could not be loaded");
    res.status(502).json({ error: "Order details are temporarily unavailable." });
  }
});

// Shiprocket's public webhook guide requires the configured security token in x-api-key.
// Keep the URL provider-neutral; Shiprocket documents that provider names in the URL can prevent delivery.
router.post("/events/delivery", async (req, res): Promise<void> => {
  if (!process.env.SHIPROCKET_WEBHOOK_SECRET?.trim()) {
    logger.error({}, "Delivery tracking callback is not configured");
    res.status(503).json({ error: "Tracking callback is not configured." });
    return;
  }
  if (!validShiprocketWebhookKey(req.get("x-api-key"))) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  if (!req.is("application/json")) {
    logger.warn({ reasonCode: "unsupported_content_type" }, "Rejected Shiprocket tracking callback");
    res.status(415).json({
      error: "A JSON tracking update is required.",
      code: "unsupported_content_type",
    });
    return;
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : null;
  if (!body) {
    logger.warn({ reasonCode: "body_not_object" }, "Rejected Shiprocket tracking callback");
    res.status(400).json({
      error: "A tracking event object is required.",
      code: "body_not_object",
    });
    return;
  }

  const webhook = parseShiprocketTrackingWebhook(body);
  const awbCode = webhook.awbCode?.trim() ?? "";
  const shipmentId = webhook.shipmentId?.trim() ?? "";
  const orderId = webhook.orderId?.trim() ?? "";
  const validReference = (value: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(value);
  // Order references are opaque provider strings, not necessarily numeric IDs or slugs.
  // Equality queries are parameterized; bound their size and reject control characters.
  const validOrderReference = (value: string): boolean =>
    value.length <= 256 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  const invalidReferenceFields = [
    ...(awbCode && !validTrackingAwb(awbCode) ? ["awb"] : []),
    ...(shipmentId && !validReference(shipmentId) ? ["shipment_id"] : []),
    ...(orderId && !validOrderReference(orderId) ? ["order_id"] : []),
  ];
  if (invalidReferenceFields.length) {
    const reasonCode = `invalid_${invalidReferenceFields[0]}`;
    logger.warn({ reasonCode, invalidFields: invalidReferenceFields }, "Rejected Shiprocket tracking callback");
    res.status(400).json({
      error: "The tracking reference is invalid.",
      code: reasonCode,
    });
    return;
  }
  if (!awbCode && !shipmentId && !orderId) {
    logger.warn({ reasonCode: "missing_reference" }, "Rejected Shiprocket tracking callback");
    res.status(400).json({
      error: "A valid AWB or shipment reference is required.",
      code: "missing_reference",
    });
    return;
  }
  if (webhook.tracking.status === "Tracking update unavailable" && !webhook.tracking.events.length) {
    logger.warn({ reasonCode: "missing_tracking_event" }, "Rejected Shiprocket tracking callback");
    res.status(400).json({
      error: "The payload must include a tracking status or activity.",
      code: "missing_tracking_event",
    });
    return;
  }

  try {
    const found = await Promise.all([
      awbCode
        ? db.select().from(checkoutShipmentPackagesTable)
            .where(eq(checkoutShipmentPackagesTable.awbCode, awbCode)).limit(2)
        : Promise.resolve([]),
      shipmentId
        ? db.select().from(checkoutShipmentPackagesTable)
            .where(eq(checkoutShipmentPackagesTable.shiprocketShipmentId, shipmentId)).limit(2)
        : Promise.resolve([]),
      orderId
        ? db.select().from(checkoutShipmentPackagesTable)
            .where(eq(checkoutShipmentPackagesTable.shiprocketOrderId, orderId)).limit(2)
        : Promise.resolve([]),
    ]);
    const uniqueMatches = new Map(found.flat().map((row) => [row.id, row]));
    if (uniqueMatches.size > 1) {
      res.status(409).json({ error: "Tracking references point to different shipments." });
      return;
    }
    const matched = [...uniqueMatches.values()][0];
    if (!matched) {
      // A valid event for a shipment outside this storefront is acknowledged to prevent retries.
      res.status(200).json({ received: true, matched: false });
      return;
    }

    const [checkout] = await db.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.id, matched.checkoutOrderId))
      .limit(1);
    if (
      !checkout ||
      checkout.paymentStatus !== "paid" ||
      !checkout.shopifyOrderId ||
      ["refund_pending", "refunded", "reconciliation_required"].includes(checkout.status)
    ) {
      res.status(200).json({ received: true, matched: false });
      return;
    }
    const reportedLifecycle = shipmentLifecycleFromTracking(
      webhook.tracking.status,
      webhook.tracking.statusCode,
    );
    if (
      isShipmentProgressStatus(reportedLifecycle) &&
      !matched.awbCode &&
      !awbCode
    ) {
      // A status-only event cannot prove the quoted/booking-pending package was booked.
      res.status(200).json({ received: true, matched: false });
      return;
    }

    const updated = await persistStoredShipmentTracking(matched.id, webhook.tracking, {
      awbCode: awbCode || null,
      shipmentId: shipmentId || null,
      orderId: orderId || null,
    });
    if (!updated) {
      res.status(409).json({ error: "The tracking reference no longer matches this shipment." });
      return;
    }
    res.status(200).json({ received: true, matched: true });
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Delivery tracking callback could not be processed");
    res.status(503).json({ error: "Tracking callback could not be processed." });
  }
});

router.get("/shopify/orders/:orderRef/tracking", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const orderRef = orderRefFromParams(req);
  if (!orderRef) {
    res.status(404).json({ error: "This order could not be found." });
    return;
  }
  const emails = await verifiedEmailsOrRespond(userId, res);
  if (!emails) return;

  try {
    const order = await loadOwnedOrder(orderRef, emails);
    if (!order) {
      res.status(404).json({ error: "This order could not be found." });
      return;
    }
    const [checkout] = await db.select()
      .from(cashfreeCheckoutOrdersTable)
      .where(eq(cashfreeCheckoutOrdersTable.shopifyOrderId, order.id))
      .limit(1);
    const shopifyPaid = order.displayFinancialStatus?.toUpperCase() === "PAID";
    const checkoutPaid = checkout?.paymentStatus === "paid" &&
      Boolean(checkout.shopifyOrderId) &&
      !["refund_pending", "refunded", "reconciliation_required"].includes(checkout.status);
    const packages = checkoutPaid && shopifyPaid
      ? await db.select().from(checkoutShipmentPackagesTable)
          .where(eq(checkoutShipmentPackagesTable.checkoutOrderId, checkout.id))
      : [];
    const shipments = [];
    const packageTrackingNumbers = new Set<string>();

    for (const shipment of packages) {
      const shipmentStatus = normalizeShipmentLifecycleStatus(shipment.status) ?? "quoted";
      const hasConfirmedBooking = isShipmentBookedOrBeyond(shipmentStatus) &&
        Boolean(shipment.awbCode);
      if (hasConfirmedBooking && shipment.awbCode) packageTrackingNumbers.add(shipment.awbCode);
      const isStale = hasConfirmedBooking && (!shipment.trackingUpdatedAt ||
        Date.now() - shipment.trackingUpdatedAt.getTime() > 2 * 60_000);
      if (hasConfirmedBooking && shipment.awbCode && isStale) {
        try {
          const tracking = await refreshStoredShipmentTracking(shipment.id, shipment.awbCode);
          if (tracking) {
            shipments.push({
              status: shipmentLifecycleLabel(tracking.shipmentStatus),
              shipmentStatus: tracking.shipmentStatus,
              statusCode: tracking.statusCode,
              awbCode: tracking.awbCode,
              courierName: tracking.courierName,
              trackingUrl: tracking.trackingUrl,
              estimatedDeliveryAt: tracking.estimatedDeliveryAt,
              events: tracking.events,
            });
            continue;
          }
        } catch (error) {
          logger.warn({
            shipmentPackageId: shipment.id,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }, "Shiprocket tracking refresh failed");
        }
      }
      const storedTrackingEvents = shipment.trackingEvents as Array<
        (typeof shipment.trackingEvents)[number] & { statusCode?: string | null }
      >;
      shipments.push({
        status: shipmentLifecycleLabel(shipmentStatus),
        shipmentStatus,
        statusCode: hasConfirmedBooking
          ? [...storedTrackingEvents].reverse().find((event) => event.statusCode)?.statusCode ?? null
          : null,
        awbCode: hasConfirmedBooking ? shipment.awbCode : null,
        courierName: shipment.courierName,
        trackingUrl: hasConfirmedBooking ? shipment.trackingUrl : null,
        estimatedDeliveryAt: hasConfirmedBooking ? shipment.estimatedDeliveryAt?.toISOString() ?? null : null,
        events: hasConfirmedBooking ? storedTrackingEvents.map((event) => ({
          ...event,
          occurredAt: parseTrackingDate(event.occurredAt),
        })) : [],
      });
    }

    for (const fulfillment of checkout ? [] : shopifyPaid ? order.fulfillments ?? [] : []) {
      for (const tracking of fulfillment.trackingInfo ?? []) {
        if (tracking.number && packageTrackingNumbers.has(tracking.number)) continue;
        shipments.push({
          status: fulfillment.status ?? "Tracking information available",
          shipmentStatus: null,
          statusCode: null,
          awbCode: tracking.number ?? null,
          courierName: tracking.company ?? null,
          trackingUrl: tracking.url && isSafeHttpsUrl(tracking.url) ? tracking.url : null,
          estimatedDeliveryAt: fulfillment.estimatedDeliveryAt ?? null,
          events: [],
        });
      }
    }

    setAuthHeaders(res);
    res.json(GetShopifyOrderTrackingResponse.parse({ orderRef, shipments }));
  } catch (error) {
    logger.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Shopper Shopify order tracking could not be loaded");
    res.status(502).json({ error: "Shipment tracking is temporarily unavailable." });
  }
});

export default router;
