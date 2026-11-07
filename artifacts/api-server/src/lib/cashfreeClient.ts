import { createHmac, timingSafeEqual } from "node:crypto";

const CASHFREE_API_VERSION = "2026-01-01";
export type CashfreeEnvironment = "sandbox" | "production";

export type CashfreeOrder = {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
  cf_order_id?: string;
};

export class CashfreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashfreeError";
  }
}

export function getCashfreeEnvironment(): CashfreeEnvironment {
  const environment = process.env.CASHFREE_ENVIRONMENT?.trim() || "sandbox";
  if (environment !== "sandbox" && environment !== "production") {
    throw new CashfreeError("CASHFREE_ENVIRONMENT must be sandbox or production.");
  }
  if (environment === "production" && process.env.CHECKOUT_LIVE_ENABLED !== "true") {
    throw new CashfreeError("Live checkout is disabled until the merchant explicitly enables it.");
  }
  return environment;
}

function baseUrl(): string {
  return getCashfreeEnvironment() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function credentials() {
  const live = getCashfreeEnvironment() === "production";
  const appId = (live ? process.env.CASHFREE_LIVE_APP_ID : process.env.CASHFREE_APP_ID)?.trim();
  const secret = live ? process.env.CASHFREE_LIVE_SECRET_KEY : process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) {
    throw new CashfreeError(
      live
        ? "Live Cashfree credentials are not configured on this server."
        : "Cashfree sandbox credentials are not configured on this server.",
    );
  }
  return { appId, secret };
}

function headers(idempotencyKey?: string): Record<string, string> {
  const { appId, secret } = credentials();
  return {
    "Content-Type": "application/json",
    "x-api-version": CASHFREE_API_VERSION,
    "x-client-id": appId,
    "x-client-secret": secret,
    ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    throw new CashfreeError("Cashfree returned an unreadable response.");
  }
  if (!response.ok) {
    throw new CashfreeError(`Cashfree request failed (${response.status}).`);
  }
  return payload as T;
}

export async function createCashfreeOrder(input: {
  orderId: string;
  amount: string;
  currencyCode: string;
  email: string;
  phone: string;
  returnUrl: string;
  expiresAt: string;
  idempotencyKey: string;
}): Promise<CashfreeOrder> {
  const response = await fetch(`${baseUrl()}/orders`, {
    method: "POST",
    headers: headers(input.idempotencyKey),
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: Number(input.amount),
      order_currency: input.currencyCode,
      customer_details: {
        customer_id: input.orderId.slice(0, 50),
        customer_email: input.email,
        customer_phone: input.phone.replace(/\D/g, ""),
      },
      order_meta: { return_url: input.returnUrl },
      order_expiry_time: input.expiresAt,
      order_note: "Chenetha storefront order",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const order = await readResponse<CashfreeOrder>(response);
  if (
    order.order_id !== input.orderId ||
    !order.payment_session_id ||
    order.order_currency !== input.currencyCode ||
    Number(order.order_amount).toFixed(2) !== Number(input.amount).toFixed(2)
  ) {
    throw new CashfreeError("Cashfree returned a session that does not match the quoted order.");
  }
  return order;
}

export async function getCashfreeOrder(orderId: string): Promise<CashfreeOrder> {
  const response = await fetch(
    `${baseUrl()}/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const order = await readResponse<CashfreeOrder>(response);
  if (order.order_id !== orderId) {
    throw new CashfreeError("Cashfree returned a different order than requested.");
  }
  return order;
}

export async function getCashfreePaymentReference(orderId: string): Promise<string | null> {
  const response = await fetch(
    `${baseUrl()}/orders/${encodeURIComponent(orderId)}/payments`,
    {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload = await readResponse<Array<{
    cf_payment_id?: string | number;
    payment_id?: string | number;
    payment_status?: string;
  }>>(response);
  const successful = payload.find((payment) =>
    ["SUCCESS", "PAID", "COMPLETED"].includes((payment.payment_status ?? "").toUpperCase()),
  );
  const reference = successful?.cf_payment_id ?? successful?.payment_id;
  return reference === undefined ? null : String(reference);
}

export function verifyCashfreeWebhookSignature(input: {
  rawBody: Buffer;
  timestamp: string;
  signature: string;
}): boolean {
  let secret: string;
  try {
    secret = credentials().secret.trim();
  } catch {
    return false;
  }
  if (!secret || !input.timestamp || !input.signature) return false;
  const expected = createHmac("sha256", secret)
    .update(input.timestamp, "utf8")
    .update(input.rawBody)
    .digest("base64");
  const actualBytes = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}
