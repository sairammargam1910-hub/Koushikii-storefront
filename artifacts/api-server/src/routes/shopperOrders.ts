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
import { shopifyAdminRequest } from "../lib/shopifyAdminClient";
import { getShiprocketTracking } from "../lib/shiprocketClient";
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
  customer?: { email?: string | null } | null;
  createdAt: string;
  processedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  totalPriceSet?: ShopifyMoneySet;
  currentTotalPriceSet?: ShopifyMoneySet;
  lineItems: { nodes: ShopifyOrderLine[] };
  fulfillments?: { nodes: ShopifyFulfillment[] } | null;
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
        customer { email }
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
        customer { email }
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
        fulfillments(first: 20) {
          nodes {
            status
            estimatedDeliveryAt
            trackingInfo { company number url }
          }
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
  const orderEmails = [order.email, order.customer?.email]
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim().toLowerCase());
  return orderEmails.some((email) => emails.has(email));
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
  return {
    orderRef: orderRefForId(order.id),
    name: order.name,
    createdAt: order.createdAt,
    processedAt: order.processedAt ?? null,
    financialStatus: order.displayFinancialStatus ?? "UNKNOWN",
    fulfillmentStatus: order.displayFulfillmentStatus ?? null,
    totalAmount: amountFrom(totalSet) ?? "0.00",
    currencyCode,
    lineItems: order.lineItems.nodes.map((line) => mapLineItem(line, currencyCode)),
  };
}

function mapOrderDetails(order: ShopifyOrderNode) {
  return {
    ...mapOrderSummary(order),
    fulfillments: (order.fulfillments?.nodes ?? []).map((fulfillment) => {
      const tracking = fulfillment.trackingInfo?.[0];
      return {
        status: fulfillment.status ?? "UNKNOWN",
        trackingCompany: tracking?.company ?? null,
        trackingNumber: tracking?.number ?? null,
        trackingUrl: tracking?.url && isSafeHttpsUrl(tracking.url) ? tracking.url : null,
        estimatedDeliveryAt: fulfillment.estimatedDeliveryAt ?? null,
      };
    }),
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
    const packages = checkout
      ? await db.select().from(checkoutShipmentPackagesTable)
          .where(eq(checkoutShipmentPackagesTable.checkoutOrderId, checkout.id))
      : [];
    const shipments = [];
    const packageTrackingNumbers = new Set<string>();

    for (const shipment of packages) {
      if (shipment.awbCode) packageTrackingNumbers.add(shipment.awbCode);
      const isStale = !shipment.trackingUpdatedAt ||
        Date.now() - shipment.trackingUpdatedAt.getTime() > 2 * 60_000;
      if (shipment.awbCode && isStale) {
        try {
          const tracking = await getShiprocketTracking(shipment.awbCode);
          const trackingEvents = tracking.events.map((event) => ({
            ...event,
            occurredAt: parseTrackingDate(event.occurredAt),
          }));
          await db.update(checkoutShipmentPackagesTable)
            .set({
              trackingStatus: tracking.status,
              trackingEvents,
              trackingUrl: tracking.trackingUrl ?? shipment.trackingUrl,
              estimatedDeliveryAt: tracking.estimatedDeliveryAt
                ? new Date(tracking.estimatedDeliveryAt)
                : null,
              trackingUpdatedAt: new Date(),
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(checkoutShipmentPackagesTable.id, shipment.id));
          shipments.push({
            status: tracking.status,
            statusCode: tracking.statusCode,
            awbCode: tracking.awbCode,
            courierName: tracking.courierName ?? shipment.courierName,
            trackingUrl: tracking.trackingUrl ?? shipment.trackingUrl,
            estimatedDeliveryAt: tracking.estimatedDeliveryAt,
            events: trackingEvents,
          });
          continue;
        } catch (error) {
          logger.warn({
            shipmentPackageId: shipment.id,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }, "Shiprocket tracking refresh failed");
        }
      }
      shipments.push({
        status: shipment.trackingStatus ?? shipmentStatusLabel(shipment.status),
        statusCode: null,
        awbCode: shipment.awbCode,
        courierName: shipment.courierName,
        trackingUrl: shipment.trackingUrl,
        estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() ?? null,
        events: shipment.trackingEvents.map((event) => ({
          ...event,
          occurredAt: parseTrackingDate(event.occurredAt),
        })),
      });
    }

    for (const fulfillment of order.fulfillments?.nodes ?? []) {
      for (const tracking of fulfillment.trackingInfo ?? []) {
        if (tracking.number && packageTrackingNumbers.has(tracking.number)) continue;
        shipments.push({
          status: fulfillment.status ?? "Tracking information available",
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

function shipmentStatusLabel(status: "quoted" | "booking_pending" | "booked" | "failed"): string {
  switch (status) {
    case "quoted":
      return "Shipping quote ready";
    case "booking_pending":
      return "Shipment booking pending";
    case "booked":
      return "Shipment booked";
    case "failed":
      return "Shipment update needed";
  }
}

export default router;
