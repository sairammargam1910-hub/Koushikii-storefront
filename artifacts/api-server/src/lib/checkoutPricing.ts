import { createHash } from "node:crypto";
import type { ShopifyCartNode } from "../routes/shopify";
import { getShiprocketModeForProductTags } from "./shiprocketClient";

export type CheckoutAddress = {
  recipient: string;
  street: string;
  address2?: string;
  city: string;
  state?: string;
  pin: string;
  countryCode: string;
};

function toMinorUnits(amount: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new Error("Shopify returned an invalid money amount.");
  return BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
}

function fromMinorUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${absolute}`;
  const divisor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / divisor}.${(absolute % divisor).toString().padStart(scale, "0")}`;
}

export function addMoney(amounts: string[]): string {
  const scale = Math.max(2, ...amounts.map((amount) => amount.split(".")[1]?.length ?? 0));
  return fromMinorUnits(
    amounts.reduce((total, amount) => total + toMinorUnits(amount, scale), 0n),
    scale,
  );
}

export function divideMoney(amount: string, divisor: number): string {
  if (!Number.isInteger(divisor) || divisor < 1) throw new Error("Invalid line quantity.");
  const scale = Math.max(2, amount.split(".")[1]?.length ?? 0);
  const minorUnits = toMinorUnits(amount, scale);
  const divisorUnits = BigInt(divisor);
  if (minorUnits % divisorUnits !== 0n) {
    throw new Error("Shopify's item total cannot be represented exactly per item.");
  }
  return fromMinorUnits(minorUnits / divisorUnits, scale);
}

export function splitMoney(amount: string, divisor: number): string[] {
  if (!Number.isInteger(divisor) || divisor < 1) throw new Error("Invalid line quantity.");
  const scale = Math.max(2, amount.split(".")[1]?.length ?? 0);
  const minorUnits = toMinorUnits(amount, scale);
  const divisorUnits = BigInt(divisor);
  const base = minorUnits / divisorUnits;
  const remainder = minorUnits % divisorUnits;
  return Array.from({ length: divisor }, (_, index) =>
    fromMinorUnits(base + (BigInt(index) < remainder ? 1n : 0n), scale),
  );
}

export function getCartDiscountAmount(cart: ShopifyCartNode): string {
  const pairs = cart.lines.nodes.map((line) => [
    line.cost.subtotalAmount.amount,
    line.cost.totalAmount.amount,
  ]);
  const scale = Math.max(
    2,
    ...pairs.flatMap((pair) => pair.map((amount) => amount.split(".")[1]?.length ?? 0)),
  );
  const discount = pairs.reduce(
    (total, [subtotal, discounted]) =>
      total + toMinorUnits(subtotal, scale) - toMinorUnits(discounted, scale),
    0n,
  );
  return fromMinorUnits(discount, scale);
}

export function getCheckoutItemTotal(cart: ShopifyCartNode): string {
  return addMoney(
    cart.lines.nodes.map((line) => line.cost.totalAmount.amount),
  );
}

export function checkoutCartFingerprint(input: {
  cart: ShopifyCartNode;
  email: string;
  phone: string;
  address: CheckoutAddress;
  parcel: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
}): string {
  const payload = {
    cartId: input.cart.id,
    currencyCode: input.cart.cost.totalAmount.currencyCode,
    itemSubtotal: input.cart.cost.subtotalAmount.amount,
    itemTotal: input.cart.cost.totalAmount.amount,
    taxAmount: input.cart.cost.totalTaxAmount?.amount ?? null,
    lines: input.cart.lines.nodes.map((line) => ({
      id: line.id,
      merchandiseId: line.merchandise?.id ?? null,
      quantity: line.quantity,
      availableForSale: line.merchandise?.availableForSale ?? false,
      subtotal: line.cost.subtotalAmount.amount,
      total: line.cost.totalAmount.amount,
      shiprocketMode: getShiprocketModeForProductTags(
        line.merchandise?.product?.tags,
      ) ?? null,
    })),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    address: {
      recipient: input.address.recipient.trim().toLowerCase(),
      street: input.address.street.trim().toLowerCase(),
      address2: input.address.address2?.trim().toLowerCase() ?? "",
      city: input.address.city.trim().toLowerCase(),
      state: input.address.state?.trim().toLowerCase() ?? "",
      postalCode: input.address.pin.trim().toLowerCase(),
      countryCode: input.address.countryCode.toUpperCase(),
    },
    parcel: input.parcel,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getShopperQuoteHash(shopperUserId: string, cartFingerprint: string): string {
  return createHash("sha256")
    .update(`${shopperUserId}\0${cartFingerprint}`)
    .digest("hex");
}

export function minimalCartSnapshot(cart: ShopifyCartNode): ShopifyCartNode {
  return {
    ...cart,
    checkoutUrl: "",
    deliveryGroups: null,
    discountCodes: [],
    lines: {
      nodes: cart.lines.nodes.map((line) => ({
        ...line,
        merchandise: line.merchandise
          ? {
              ...line.merchandise,
              product: {
                ...line.merchandise.product,
                description: "",
                tags: [],
                featuredImage: null,
              },
              selectedOptions: [],
            }
          : null,
      })),
    },
  };
}
