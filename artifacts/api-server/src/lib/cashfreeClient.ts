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

export type CashfreeCreateOrderRequestSummary = {
  orderId: string;
  orderAmount: number;
  orderCurrency: string;
  orderIdValid: boolean;
  orderAmountValid: boolean;
  orderCurrencyValid: boolean;
  customerIdLength: number;
  customerIdAlphanumeric: boolean;
  customerEmailValid: boolean;
  customerPhoneDigitCount: number;
  returnUrlLength: number;
  returnUrlLengthValid: boolean;
  returnUrlProtocol: string;
  returnUrlHost: string;
  returnUrlPath: string;
  returnUrlValid: boolean;
  idempotencyKeyUuid: boolean;
};

type CashfreeErrorDetails = {
  upstreamStatus?: number;
  providerCode?: string;
  providerType?: string;
  providerMessage?: string;
  createOrderRequest?: CashfreeCreateOrderRequestSummary;
};

export class CashfreeError extends Error {
  readonly upstreamStatus?: number;
  readonly providerCode?: string;
  readonly providerType?: string;
  readonly providerMessage?: string;
  readonly createOrderRequest?: CashfreeCreateOrderRequestSummary;

  constructor(message: string, details: CashfreeErrorDetails = {}) {
    super(message);
    this.name = "CashfreeError";
    this.upstreamStatus = details.upstreamStatus;
    this.providerCode = details.providerCode;
    this.providerType = details.providerType;
    this.providerMessage = details.providerMessage;
    this.createOrderRequest = details.createOrderRequest;
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

/**
 * Live checkout requires account-specific facts to be verified in Cashfree.
 * These values are intentionally separate from the live-enable approval so
 * credentials alone can never activate production payments.
 */
export function assertCashfreeLiveReadiness(
  currencyCode: string,
  isInternational: boolean,
): void {
  if (getCashfreeEnvironment() !== "production") return;

  if (process.env.CASHFREE_INTERNATIONAL_PAYMENTS_CONFIRMED !== "true") {
    throw new CashfreeError(
      isInternational
        ? "Live checkout to this destination is paused until Cashfree confirms international payments are enabled for this account."
        : "Live checkout is paused until Cashfree confirms international payments are enabled for this account.",
    );
  }

  const supportedCurrencies = new Set(
    (process.env.CASHFREE_SUPPORTED_CURRENCIES ?? "")
      .split(",")
      .map((currency) => currency.trim().toUpperCase())
      .filter(Boolean),
  );
  if (!supportedCurrencies.size) {
    throw new CashfreeError(
      "Live checkout is paused until the currencies confirmed by Cashfree are configured.",
    );
  }
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  if (!supportedCurrencies.has(normalizedCurrency)) {
    throw new CashfreeError(
      `Live checkout is paused because Cashfree has not confirmed support for ${normalizedCurrency}.`,
    );
  }

  const settlementCurrency = process.env.CASHFREE_SETTLEMENT_CURRENCY?.trim().toUpperCase();
  if (!settlementCurrency || !/^[A-Z]{3}$/.test(settlementCurrency)) {
    throw new CashfreeError(
      "Live checkout is paused until Cashfree's settlement currency is confirmed and configured.",
    );
  }
  if (settlementCurrency !== normalizedCurrency) {
    throw new CashfreeError(
      `Live checkout is paused because the quoted ${normalizedCurrency} currency does not match the confirmed ${settlementCurrency} settlement currency.`,
    );
  }
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

function boundedProviderText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength) || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readResponse<T>(
  response: Response,
  createOrderRequest?: CashfreeCreateOrderRequestSummary,
): Promise<T> {
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    if (!response.ok) {
      throw new CashfreeError(
        "Secure payment could not be prepared. Your bag has not been charged. Please try again.",
        {
          upstreamStatus: response.status,
          providerMessage: boundedProviderText(body, 500),
          createOrderRequest,
        },
      );
    }
    throw new CashfreeError("Cashfree returned an unreadable response.");
  }
  if (!response.ok) {
    const errorPayload = isRecord(payload) ? payload : {};
    throw new CashfreeError(
      "Secure payment could not be prepared. Your bag has not been charged. Please try again.",
      {
        upstreamStatus: response.status,
        providerCode: boundedProviderText(errorPayload.code, 100),
        providerType: boundedProviderText(errorPayload.type, 100),
        providerMessage: boundedProviderText(errorPayload.message, 500),
        createOrderRequest,
      },
    );
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
  isInternational: boolean;
}): Promise<CashfreeOrder> {
  assertCashfreeLiveReadiness(input.currencyCode, input.isInternational);
  const requestBody = {
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
  };
  let returnUrl: URL | undefined;
  try {
    returnUrl = new URL(input.returnUrl);
  } catch {
    // The summary records an invalid URL without logging the raw value.
  }
  const createOrderRequest: CashfreeCreateOrderRequestSummary = {
    orderId: requestBody.order_id,
    orderAmount: requestBody.order_amount,
    orderCurrency: requestBody.order_currency,
    orderIdValid: /^[A-Za-z0-9_-]{3,45}$/.test(requestBody.order_id),
    orderAmountValid: Number.isFinite(requestBody.order_amount) &&
      requestBody.order_amount >= 1 &&
      Math.round(requestBody.order_amount * 100) / 100 === requestBody.order_amount,
    orderCurrencyValid: /^[A-Z]{3}$/.test(requestBody.order_currency),
    customerIdLength: requestBody.customer_details.customer_id.length,
    customerIdAlphanumeric: /^[A-Za-z0-9]+$/.test(requestBody.customer_details.customer_id),
    customerEmailValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestBody.customer_details.customer_email),
    customerPhoneDigitCount: requestBody.customer_details.customer_phone.length,
    returnUrlLength: input.returnUrl.length,
    returnUrlLengthValid: input.returnUrl.length <= 250,
    returnUrlProtocol: returnUrl?.protocol ?? "invalid",
    returnUrlHost: returnUrl?.host ?? "",
    returnUrlPath: returnUrl?.pathname ?? "",
    returnUrlValid: Boolean(returnUrl && returnUrl.protocol === "https:" && !returnUrl.username && !returnUrl.password),
    idempotencyKeyUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey),
  };
  const response = await fetch(`${baseUrl()}/orders`, {
    method: "POST",
    headers: headers(input.idempotencyKey),
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15_000),
  });
  const order = await readResponse<CashfreeOrder>(response, createOrderRequest);
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
