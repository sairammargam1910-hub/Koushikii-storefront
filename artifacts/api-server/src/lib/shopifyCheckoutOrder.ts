import {
  assertNoUserErrors,
  shopifyAdminRequest,
  ShopifyAdminError,
} from "./shopifyAdminClient";
import { getCheckoutItemTotal, splitMoney } from "./checkoutPricing";
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

const READ_ORDER_PAYMENT_QUERY = `#graphql
  query ReadCashfreeTestOrderPayment($id: ID!) {
    order(id: $id) {
      id
      name
      test
      currencyCode
      totalPriceSet {
        shopMoney { amount currencyCode }
      }
      totalShippingPriceSet {
        shopMoney { amount currencyCode }
      }
      totalTaxSet {
        shopMoney { amount currencyCode }
      }
      taxLines {
        priceSet { shopMoney { amount currencyCode } }
      }
      lineItems(first: 100) {
        nodes {
          quantity
          variant { id }
          originalUnitPriceSet {
            shopMoney { amount currencyCode }
          }
          taxLines {
            priceSet { shopMoney { amount currencyCode } }
          }
        }
      }
      shippingLines(first: 10) {
        nodes {
          title
          source
          code
          originalPriceSet {
            shopMoney { amount currencyCode }
          }
        }
      }
      transactions {
        kind
        status
        gateway
        authorizationCode
        test
        amountSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
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

function inMinorUnits(amount: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  return BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(2, "0")}`);
}

async function verifySandboxOrderPayment(input: {
  order: { id: string; name: string };
  amount: string;
  shippingAmount: string;
  currencyCode: string;
  paymentReference: string;
  cart: ShopifyCartNode;
}): Promise<void> {
  const data = await shopifyAdminRequest<{
    order: {
      id: string;
      name: string;
      test: boolean;
      currencyCode: string;
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      totalShippingPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      totalTaxSet: { shopMoney: { amount: string; currencyCode: string } };
      taxLines: Array<unknown>;
      lineItems: {
        nodes: Array<{
          quantity: number;
          variant: { id: string } | null;
          originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
          taxLines: Array<unknown>;
        }>;
      };
      shippingLines: {
        nodes: Array<{
          title: string;
          source: string;
          code: string;
          originalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
        }>;
      };
      transactions: Array<{
        kind: string;
        status: string;
        gateway: string;
        authorizationCode: string | null;
        test: boolean;
        amountSet: {
          shopMoney: { amount: string; currencyCode: string };
        };
      }>;
    } | null;
  }>(READ_ORDER_PAYMENT_QUERY, { id: input.order.id });
  const savedOrder = data.order;
  const expectedAmount = inMinorUnits(input.amount);
  const expectedShippingAmount = inMinorUnits(input.shippingAmount);
  const expectedItems = new Map<string, number>();
  for (const line of input.cart.lines.nodes) {
    if (!line.merchandise) {
      throw new ShopifyCheckoutSyncError("The paid Shopify cart is missing a product variant.");
    }
    for (const price of splitMoney(line.cost.totalAmount.amount, line.quantity)) {
      const minorUnits = inMinorUnits(price);
      if (minorUnits === null) {
        throw new ShopifyCheckoutSyncError("The paid Shopify cart contains an invalid item price.");
      }
      const key = `${line.merchandise.id}:${minorUnits}`;
      expectedItems.set(key, (expectedItems.get(key) ?? 0) + 1);
    }
  }
  const savedItems = new Map<string, number>();
  for (const line of savedOrder?.lineItems.nodes ?? []) {
    const minorUnits = inMinorUnits(line.originalUnitPriceSet.shopMoney.amount);
    if (
      !line.variant ||
      minorUnits === null ||
      line.originalUnitPriceSet.shopMoney.currencyCode !== input.currencyCode ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.taxLines.length > 0
    ) {
      continue;
    }
    const key = `${line.variant.id}:${minorUnits}`;
    savedItems.set(key, (savedItems.get(key) ?? 0) + line.quantity);
  }
  const itemsMatch = expectedItems.size === savedItems.size &&
    [...expectedItems].every(([key, quantity]) => savedItems.get(key) === quantity);
  const shippingLines = savedOrder?.shippingLines.nodes ?? [];
  const shippingMatches = shippingLines.length === 1 &&
    shippingLines[0].title.startsWith("Shiprocket · ") &&
    shippingLines[0].source === "Shiprocket" &&
    shippingLines[0].code === "SHIPROCKET_QUOTE" &&
    expectedShippingAmount !== null &&
    shippingLines[0].originalPriceSet.shopMoney.currencyCode === input.currencyCode &&
    inMinorUnits(shippingLines[0].originalPriceSet.shopMoney.amount) === expectedShippingAmount;
  const totalsMatch = expectedAmount !== null &&
    savedOrder?.totalPriceSet.shopMoney.currencyCode === input.currencyCode &&
    inMinorUnits(savedOrder.totalPriceSet.shopMoney.amount) === expectedAmount &&
    expectedShippingAmount !== null &&
    savedOrder?.totalShippingPriceSet.shopMoney.currencyCode === input.currencyCode &&
    inMinorUnits(savedOrder.totalShippingPriceSet.shopMoney.amount) === expectedShippingAmount &&
    savedOrder?.totalTaxSet.shopMoney.currencyCode === input.currencyCode &&
    inMinorUnits(savedOrder.totalTaxSet.shopMoney.amount) === 0n &&
    savedOrder.taxLines.length === 0;
  const paymentWasSaved = savedOrder?.id === input.order.id &&
    savedOrder.test === true &&
    savedOrder.currencyCode === input.currencyCode &&
    expectedAmount !== null &&
    savedOrder.transactions.some((transaction) =>
      transaction.kind === "SALE" &&
      transaction.status === "SUCCESS" &&
      transaction.gateway === "Cashfree" &&
      transaction.test === true &&
      transaction.authorizationCode === input.paymentReference &&
      transaction.amountSet.shopMoney.currencyCode === input.currencyCode &&
      inMinorUnits(transaction.amountSet.shopMoney.amount) === expectedAmount
    );
  if (!paymentWasSaved || !itemsMatch || !shippingMatches || !totalsMatch) {
    throw new ShopifyCheckoutSyncError(
      "Shopify did not retain the quoted item, shipping, tax, total, and Cashfree payment details on the sandbox test order.",
    );
  }
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

function orderTotals(cart: ShopifyCartNode) {
  return { itemLinesTotal: getCheckoutItemTotal(cart) };
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
  const cart = input.snapshot.cart;
  const currencyCode = cart.cost.totalAmount.currencyCode;
  if (
    currencyCode !== input.snapshot.shippingCurrencyCode ||
    currencyCode !== "INR"
  ) {
    throw new ShopifyCheckoutSyncError("Shopify and Cashfree order currencies do not match.");
  }
  const totals = orderTotals(cart);
  const transactionAmount = input.snapshot.totalAmount;
  const sum = addAmounts([totals.itemLinesTotal, input.snapshot.shippingAmount]);
  if (sum !== transactionAmount) {
    throw new ShopifyCheckoutSyncError(
      "Shopify order lines and shipping do not match the confirmed Cashfree payment.",
    );
  }
  const sandbox = getCashfreeEnvironment() === "sandbox";
  const existing = await shopifyAdminRequest<{
    orders: { nodes: Array<{ id: string; name: string }> };
  }>(FIND_ORDER_QUERY, { query: `source_identifier:${sourceId}` });
  const found = existing.orders.nodes[0];
  if (found) {
    if (sandbox) {
      await verifySandboxOrderPayment({
        order: found,
        amount: transactionAmount,
        shippingAmount: input.snapshot.shippingAmount,
        currencyCode,
        paymentReference: input.paymentReference,
        cart,
      });
    }
    return found;
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
      taxable: false,
      requiresShipping: true,
      priceSet: {
        shopMoney: {
          amount: unitPrice,
          currencyCode,
        },
      },
    }));
  });
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
      "Catalog prices are final; checkout adds shipping only.",
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
    taxesIncluded: false,
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
  if (sandbox) {
    await verifySandboxOrderPayment({
      order: created.orderCreate.order,
      amount: transactionAmount,
      shippingAmount: input.snapshot.shippingAmount,
      currencyCode,
      paymentReference: input.paymentReference,
      cart,
    });
  }
  return created.orderCreate.order;
}
