import {
  assertNoUserErrors,
  shopifyAdminRequest,
  ShopifyAdminError,
} from "./shopifyAdminClient";
import { splitMoney } from "./checkoutPricing";
import { getCashfreeEnvironment } from "./cashfreeClient";
import type { ShopifyCartNode } from "../routes/shopify";

const SHOPIFY_CHECKOUT_STORE = "gtnbsw-x3.myshopify.com";
const ORDER_CAPABILITIES_QUERY = `#graphql
  query CashfreeCheckoutCapabilities {
    shop { myshopifyDomain }
    currentAppInstallation { accessScopes { handle } }
  }
`;

const FIND_ORDER_QUERY = `#graphql
  query FindCashfreeOrder($query: String!) {
    orders(first: 1, query: $query) {
      nodes { id name }
    }
  }
`;

const CREATE_ORDER_MUTATION = `#graphql
  mutation CreateCashfreePaidOrder(
    $order: OrderCreateOrderInput!
    $options: OrderCreateOptionsInput
  ) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

export class ShopifyCheckoutSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyCheckoutSyncError";
  }
}

export async function assertShopifyCheckoutCapabilities(): Promise<void> {
  let data: {
    shop: { myshopifyDomain: string };
    currentAppInstallation: { accessScopes: Array<{ handle: string }> };
  };
  try {
    data = await shopifyAdminRequest(ORDER_CAPABILITIES_QUERY);
  } catch {
    throw new ShopifyCheckoutSyncError(
      `The Shopify order connection for ${SHOPIFY_CHECKOUT_STORE} could not be verified.`,
    );
  }
  if (data.shop?.myshopifyDomain?.toLowerCase() !== SHOPIFY_CHECKOUT_STORE) {
    throw new ShopifyCheckoutSyncError(
      `Checkout is paused because the connected Shopify store is not ${SHOPIFY_CHECKOUT_STORE}.`,
    );
  }
  const scopes = new Set(data.currentAppInstallation?.accessScopes?.map(({ handle }) => handle) ?? []);
  const missing = ["read_orders", "write_orders"].filter((scope) => !scopes.has(scope));
  if (missing.length) {
    throw new ShopifyCheckoutSyncError(
      `Checkout is paused because the Shopify app on ${SHOPIFY_CHECKOUT_STORE} needs ${missing.join(" and ")} permission.`,
    );
  }
}

function scaled(amount: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new ShopifyCheckoutSyncError("Shopify returned an invalid order amount.");
  return BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
}

function amountFromMinorUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (!scale) return `${negative ? "-" : ""}${absolute}`;
  const factor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / factor}.${(absolute % factor).toString().padStart(scale, "0")}`;
}

function addAmounts(amounts: string[]): string {
  const scale = Math.max(0, ...amounts.map((amount) => amount.split(".")[1]?.length ?? 0));
  return amountFromMinorUnits(amounts.reduce((sum, amount) => sum + scaled(amount, scale), 0n), scale);
}

function splitName(value: string) {
  const [firstName, ...rest] = value.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") || firstName };
}

function orderTotals(cart: ShopifyCartNode, shippingAmount: string) {
  const lineTotals = cart.lines.nodes.map(({ cost }) => cost.totalAmount.amount);
  const itemLinesTotal = addAmounts(lineTotals);
  const totalTax = cart.cost.totalTaxAmount?.amount;
  if (totalTax === undefined || totalTax === null) {
    throw new ShopifyCheckoutSyncError("Shopify did not return a tax total for this address.");
  }
  const cartTotal = cart.cost.totalAmount.amount;
  const withTax = addAmounts([itemLinesTotal, totalTax]);
  if (withTax === cartTotal) {
    return { itemLinesTotal, taxesIncluded: false, totalTax };
  }
  if (itemLinesTotal === cartTotal) {
    return { itemLinesTotal, taxesIncluded: true, totalTax };
  }
  throw new ShopifyCheckoutSyncError(
    "Shopify's item and tax totals do not match the amount quoted to the shopper.",
  );
}

export async function createOrFindShopifyPaidOrder(input: {
  orderId: string;
  paymentReference: string;
  snapshot: {
    cart: ShopifyCartNode;
    email: string;
    phone: string;
    address: {
      recipient: string;
      street: string;
      address2?: string;
      city: string;
      state?: string;
      pin: string;
      countryCode: string;
    };
    shippingAmount: string;
    shippingCurrencyCode: string;
    courierName: string;
    totalAmount: string;
    taxAmount: string;
    itemSubtotal: string;
    discountAmount: string;
  };
}): Promise<{ id: string; name: string }> {
  await assertShopifyCheckoutCapabilities();
  const tag = `cashfree-${input.orderId}`;
  const sourceId = input.orderId.replace(/[^a-zA-Z0-9_-]/g, "");
  const existing = await shopifyAdminRequest<{
    orders: { nodes: Array<{ id: string; name: string }> };
  }>(FIND_ORDER_QUERY, { query: `source_identifier:${sourceId}` });
  const found = existing.orders.nodes[0];
  if (found) return found;

  const cart = input.snapshot.cart;
  const currencyCode = cart.cost.totalAmount.currencyCode;
  if (
    currencyCode !== input.snapshot.shippingCurrencyCode ||
    currencyCode !== "INR"
  ) {
    throw new ShopifyCheckoutSyncError("Shopify and Cashfree order currencies do not match.");
  }
  const totals = orderTotals(cart, input.snapshot.shippingAmount);
  const transactionAmount = input.snapshot.totalAmount;
  const sum = addAmounts([
    totals.itemLinesTotal,
    ...(totals.taxesIncluded ? [] : [totals.totalTax]),
    input.snapshot.shippingAmount,
  ]);
  if (sum !== transactionAmount) {
    throw new ShopifyCheckoutSyncError(
      "Shopify order lines, tax, and shipping do not match the confirmed Cashfree payment.",
    );
  }
  const { firstName, lastName } = splitName(input.snapshot.address.recipient);
  const lineItems = cart.lines.nodes.flatMap((line) => {
    const merchandise = line.merchandise;
    if (!merchandise || !merchandise.availableForSale) {
      throw new ShopifyCheckoutSyncError("A paid Shopify cart item is no longer available for order sync.");
    }
    return splitMoney(line.cost.totalAmount.amount, line.quantity).map((unitPrice) => ({
      variantId: merchandise.id,
      title: `${merchandise.product.title} · ${merchandise.title}`,
      sku: merchandise.sku || merchandise.id.split("/").at(-1),
      quantity: 1,
      taxable: true,
      requiresShipping: true,
      priceSet: {
        shopMoney: {
          amount: unitPrice,
          currencyCode,
        },
      },
    }));
  });
  const taxBase = totals.taxesIncluded
    ? Number(totals.itemLinesTotal) - Number(totals.totalTax)
    : Number(totals.itemLinesTotal);
  if (Number(totals.totalTax) > 0 && taxBase <= 0) {
    throw new ShopifyCheckoutSyncError("Shopify returned a tax total without a valid taxable base.");
  }
  const taxRate = taxBase > 0 ? Number(totals.totalTax) / taxBase : 0;
  const sandbox = getCashfreeEnvironment() === "sandbox";
  const order = {
    currency: currencyCode,
    presentmentCurrency: currencyCode,
    email: input.snapshot.email,
    phone: input.snapshot.phone,
    sourceIdentifier: sourceId,
    sourceName: "cashfree",
    tags: ["cashfree-checkout", tag],
    note: [
      `External payment: Cashfree ${input.orderId}`,
      `Carrier quote: Shiprocket · ${input.snapshot.courierName}`,
      `Item subtotal before discounts: ${input.snapshot.itemSubtotal} ${currencyCode}`,
      `Discount applied: ${input.snapshot.discountAmount} ${currencyCode}`,
      `Tax from Shopify cart: ${input.snapshot.taxAmount} ${currencyCode}`,
    ].join("\n"),
    customAttributes: [
      { key: "Cashfree order ID", value: input.orderId },
      { key: "Cashfree payment reference", value: input.paymentReference },
      { key: "Shipping carrier", value: "Shiprocket" },
      { key: "Shipping method", value: input.snapshot.courierName },
      { key: "Quote currency", value: currencyCode },
      { key: "Items subtotal before discounts", value: input.snapshot.itemSubtotal },
      { key: "Discount applied", value: input.snapshot.discountAmount },
    ],
    shippingAddress: {
      firstName,
      lastName,
      address1: input.snapshot.address.street,
      ...(input.snapshot.address.address2 ? { address2: input.snapshot.address.address2 } : {}),
      city: input.snapshot.address.city,
      ...(input.snapshot.address.state ? { province: input.snapshot.address.state } : {}),
      zip: input.snapshot.address.pin,
      countryCode: input.snapshot.address.countryCode,
      phone: input.snapshot.phone,
    },
    lineItems,
    shippingLines: [{
      title: `Shiprocket · ${input.snapshot.courierName}`,
      source: "Shiprocket",
      code: "SHIPROCKET_QUOTE",
      priceSet: { shopMoney: { amount: input.snapshot.shippingAmount, currencyCode } },
    }],
    taxesIncluded: totals.taxesIncluded,
    ...(Number(totals.totalTax) > 0 ? {
      taxLines: [{
        title: "Shopify checkout tax",
        rate: taxRate,
        priceSet: { shopMoney: { amount: totals.totalTax, currencyCode } },
      }],
    } : {}),
    transactions: [{
      kind: "SALE",
      status: "SUCCESS",
      gateway: "Cashfree",
      authorizationCode: input.paymentReference,
      test: sandbox,
      amountSet: { shopMoney: { amount: transactionAmount, currencyCode } },
      receiptJson: {
        cashfree_order_id: input.orderId,
        cashfree_payment_reference: input.paymentReference,
      },
    }],
    test: sandbox,
  };
  const created = await shopifyAdminRequest<{
    orderCreate: {
      order: { id: string; name: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(CREATE_ORDER_MUTATION, {
    order,
    options: {
      inventoryBehaviour: sandbox ? "BYPASS" : "DECREMENT_IGNORING_POLICY",
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  });
  assertNoUserErrors(created.orderCreate.userErrors);
  if (!created.orderCreate.order) {
    throw new ShopifyAdminError("Shopify did not return the created checkout order.");
  }
  return created.orderCreate.order;
}
