type ShiprocketPickup = {
  id?: number;
  pickup_location?: string;
  pickup_location_name?: string;
  pin_code?: string;
  pincode?: string;
  pin?: string;
};

type ShiprocketCourier = {
  courier_company_id?: number | string;
  courier_name?: string;
  rate?: number | string;
  freight_charge?: number | string;
  currency?: string;
};

export type ShiprocketQuote = {
  orderId: string;
  shipmentId: string;
  courierId: string;
  courierName: string;
  amount: string;
  currencyCode: "INR";
};

export type ShiprocketTrackingEvent = {
  occurredAt: string | null;
  status: string;
  description: string;
  location: string | null;
  statusCode?: string | null;
};

export type ShiprocketTracking = {
  status: string;
  statusCode: string | null;
  awbCode: string;
  courierName: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: string | null;
  events: ShiprocketTrackingEvent[];
};

export type ShiprocketPackageInput = {
  orderId: string;
  packageIndex: number;
  destination: {
    recipient: string;
    street: string;
    address2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
    countryName: string;
  };
  email: string;
  phone: string;
  productName: string;
  sku: string;
  sellingPrice: string;
  currencyCode: string;
  hsnCode?: string;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export class ShiprocketError extends Error {
  readonly diagnostics: {
    endpoint?: string;
    httpStatus?: number;
    errorCode?: string;
    message: string;
  };

  constructor(
    message: string,
    details: {
      endpoint?: string;
      httpStatus?: number;
      errorCode?: unknown;
      providerMessage?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ShiprocketError";
    const diagnosticMessage = sanitizeShiprocketDiagnosticMessage(
      details.providerMessage,
    ) ?? sanitizeShiprocketDiagnosticMessage(message) ?? "Shiprocket request failed.";
    const errorCode = sanitizeShiprocketErrorCode(details.errorCode);
    const endpoint = details.endpoint
      ? sanitizeShiprocketEndpoint(details.endpoint)
      : undefined;
    const httpStatus = Number.isInteger(details.httpStatus) &&
      details.httpStatus! >= 100 &&
      details.httpStatus! <= 599
      ? details.httpStatus
      : undefined;

    this.diagnostics = {
      ...(endpoint ? { endpoint } : {}),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(errorCode ? { errorCode } : {}),
      message: diagnosticMessage,
    };
  }
}

function sanitizeShiprocketEndpoint(endpoint: string): string {
  return endpoint
    .split("?")[0]
    .replace(/\/\d{5,}(?=\/|$)/g, "/[redacted]")
    .slice(0, 120);
}

function sanitizeShiprocketErrorCode(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(code) ? code : undefined;
}

function sanitizeShiprocketDiagnosticMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let message = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!message) return undefined;

  message = message
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/((?:authorization|token|password|secret|api[_ -]?key)\b\s*[:=]\s*)["']?[^\s,;}\]]+/gi, "$1[redacted]")
    .replace(/((?:customer(?:[_\s-]?name)?|recipient|contact|address(?:[_\s-]?[12])?|billing[_\s-]?address|shipping[_\s-]?address|phone|mobile|email|post(?:al)?[_\s-]?code|pin[_\s-]?code)\b["']?\s*[:=]\s*["']?)[^,;}\]]+/gi, "$1[redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\+?\d[\d().\s-]{5,}\d/g, "[redacted-number]")
    .replace(/\b\d{5,}\b/g, "[redacted-number]")
    .replace(/\s{2,}/g, " ")
    .trim();

  return message.slice(0, 240);
}

const API_BASE = "https://apiv2.shiprocket.in/v1/external";
let cachedToken: { token: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const email = process.env.SHIPROCKET_API_USER_EMAIL?.trim();
    const password = process.env.SHIPROCKET_API_USER_PASSWORD;
    if (!email || !password) {
      throw new ShiprocketError("Shiprocket API credentials are not configured on this server.");
    }
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readPayload(response);
    const token = typeof payload.token === "string" ? payload.token : "";
    if (!response.ok || !token) {
      throw new ShiprocketError(`Shiprocket authentication failed (${response.status}).`, {
        endpoint: "/auth/login",
        httpStatus: response.status,
        errorCode: payload.error_code ?? payload.code ?? payload.status_code,
        providerMessage: payload.message ?? payload.error,
      });
    }
    cachedToken = { token, expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
    return token;
  })().finally(() => { tokenRequest = undefined; });
  return tokenRequest;
}

async function readPayload(response: Response): Promise<Record<string, any>> {
  const body = await response.text();
  try {
    const payload = body ? JSON.parse(body) : {};
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    throw new ShiprocketError("Shiprocket returned an unreadable response.");
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await authenticate();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.status_code && Number(payload.status_code) >= 400) {
    const providerMessage = payload.message ?? payload.error;
    const details = {
      endpoint: path.split("?")[0],
      httpStatus: response.status,
      errorCode: payload.error_code ?? payload.code ?? payload.status_code,
      providerMessage,
    };
    if (/no serviceable couriers available|destination.*not serviceable/i.test(String(providerMessage ?? ""))) {
      throw new ShiprocketError("Shiprocket has no serviceable courier for this address.", details);
    }
    throw new ShiprocketError(`Shiprocket request failed (${response.status}).`, details);
  }
  return payload as T;
}

function getConfiguredPickupPostcode(): string {
  const postcode = (process.env.SHIPROCKET_PICKUP_POSTCODE || "500007").trim();
  if (!/^\d{5,10}$/.test(postcode)) {
    throw new ShiprocketError("Shiprocket pickup postcode is invalid.");
  }
  return postcode;
}

function getParcelDimensions() {
  const weightKg = Number(process.env.SHIPROCKET_PARCEL_WEIGHT_KG || "1");
  const lengthCm = Number(process.env.SHIPROCKET_PARCEL_LENGTH_CM || "35");
  const breadthCm = Number(process.env.SHIPROCKET_PARCEL_BREADTH_CM || "25");
  const heightCm = Number(process.env.SHIPROCKET_PARCEL_HEIGHT_CM || "8");
  if (
    !Number.isFinite(weightKg) || weightKg <= 0 ||
    !Number.isFinite(lengthCm) || lengthCm <= 0 ||
    !Number.isFinite(breadthCm) || breadthCm <= 0 ||
    !Number.isFinite(heightCm) || heightCm <= 0
  ) {
    throw new ShiprocketError("Shiprocket parcel weight and dimensions must be positive numbers.");
  }
  return { weightKg, lengthCm, breadthCm, heightCm };
}

async function getPickupLocation(): Promise<ShiprocketPickup> {
  const payload = await request<{
    data?: ShiprocketPickup[] | {
      data?: ShiprocketPickup[];
      shipping_address?: ShiprocketPickup[];
    };
  }>("/settings/company/pickup");
  const locations = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.data)
      ? payload.data.data
      : Array.isArray(payload.data?.shipping_address)
        ? payload.data.shipping_address
        : [];
  const requestedPostcode = getConfiguredPickupPostcode();
  const pickup = locations.find((item) =>
    String(item.pin_code ?? item.pincode ?? item.pin ?? "") === requestedPostcode,
  );
  if (!pickup || !pickup.id || !(pickup.pickup_location ?? pickup.pickup_location_name)) {
    throw new ShiprocketError(
      `Shiprocket has no configured pickup location for postcode ${requestedPostcode}.`,
    );
  }
  return pickup;
}

function toAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseCouriers(payload: {
  data?: { available_courier_companies?: ShiprocketCourier[] } | ShiprocketCourier[];
}): ShiprocketCourier[] {
  if (Array.isArray(payload.data)) return payload.data;
  return payload.data?.available_courier_companies ?? [];
}

export function selectLowestCourier(
  couriers: ShiprocketCourier[],
): { courierId: string; courierName: string; amount: string } {
  const valid = couriers.flatMap((courier) => {
    const amount = toAmount(courier.rate ?? courier.freight_charge);
    if (
      amount === null ||
      courier.courier_company_id === undefined ||
      !courier.courier_name?.trim()
    ) return [];
    return [{
      courierId: String(courier.courier_company_id),
      courierName: courier.courier_name.trim(),
      amount,
    }];
  });
  const lowest = valid.sort((left, right) => left.amount - right.amount)[0];
  if (!lowest) throw new ShiprocketError("Shiprocket has no serviceable courier for this address.");
  return {
    courierId: lowest.courierId,
    courierName: lowest.courierName,
    amount: lowest.amount.toFixed(2),
  };
}

function splitName(value: string) {
  const [firstName, ...rest] = value.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") || firstName };
}

function makeShiprocketOrderBody(
  input: ShiprocketPackageInput,
  pickup: ShiprocketPickup,
  international: boolean,
) {
  const { firstName, lastName } = splitName(input.destination.recipient);
  const itemPrice = Number(input.sellingPrice);
  if (!Number.isFinite(itemPrice) || itemPrice < 0) {
    throw new ShiprocketError("Shopify returned an invalid item price for shipping.");
  }
  const body: Record<string, unknown> = {
    order_id: input.orderId,
    order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
    pickup_location: pickup.pickup_location ?? pickup.pickup_location_name,
    pickup_location_id: pickup.id,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: input.destination.street,
    ...(input.destination.address2 ? { billing_address_2: input.destination.address2 } : {}),
    billing_city: input.destination.city,
    billing_pincode: input.destination.postalCode,
    billing_state: input.destination.state || input.destination.city,
    billing_country: input.destination.countryName,
    billing_email: input.email,
    billing_phone: input.phone.replace(/\D/g, ""),
    shipping_is_billing: true,
    order_items: [{
      name: input.productName.slice(0, 120),
      sku: input.sku.slice(0, 80),
      units: 1,
      selling_price: itemPrice,
      ...(international && input.hsnCode ? { hsn: Number(input.hsnCode) } : {}),
    }],
    payment_method: "Prepaid",
    shipping_charges: 0,
    sub_total: itemPrice,
    length: input.lengthCm,
    breadth: input.breadthCm,
    height: input.heightCm,
    weight: input.weightKg,
  };
  if (international) {
    if (!input.hsnCode || !/^\d{4,8}$/.test(input.hsnCode.trim())) {
      throw new ShiprocketError("A valid Shiprocket HSN code must be configured before international quotes can be requested.");
    }
    const reasonOfExport = process.env.SHIPROCKET_REASON_OF_EXPORT?.trim();
    const invoiceTerms = process.env.SHIPROCKET_TERMS_OF_INVOICE?.trim().toUpperCase();
    if (!reasonOfExport || !["0", "1", "2", "3"].includes(reasonOfExport)) {
      throw new ShiprocketError("Shiprocket export purpose must be configured before international quotes can be requested.");
    }
    if (invoiceTerms !== "FOB" && invoiceTerms !== "CIF") {
      throw new ShiprocketError("Shiprocket invoice terms must be configured as FOB or CIF before international quotes can be requested.");
    }
    if (!["INR", "USD", "GBP", "EUR", "AUD", "CAD", "SAR", "AED", "SGD"].includes(input.currencyCode)) {
      throw new ShiprocketError(`Shiprocket does not support the Shopify cart currency ${input.currencyCode} for international orders.`);
    }
    body.currency = input.currencyCode;
    body.reasonOfExport = Number(reasonOfExport);
    body.Terms_Of_Invoice = invoiceTerms;
  }
  return body;
}

function getCreatedOrder(payload: {
  order_id?: string | number;
  shipment_id?: string | number;
  data?: { order_id?: string | number; shipment_id?: string | number };
}) {
  const data = payload.data ?? payload;
  const orderId = data.order_id;
  const shipmentId = data.shipment_id;
  if (orderId === undefined || shipmentId === undefined) {
    throw new ShiprocketError("Shiprocket did not return both order and shipment references.");
  }
  return { orderId: String(orderId), shipmentId: String(shipmentId) };
}

export async function createAndQuotePackage(
  input: ShiprocketPackageInput,
): Promise<ShiprocketQuote> {
  const international = input.destination.countryCode !== "IN";
  const pickup = await getPickupLocation();
  const orderPath = international
    ? "/international/orders/create/adhoc"
    : "/orders/create/adhoc";
  const orderPayload = await request<{
    order_id?: string | number;
    shipment_id?: string | number;
    data?: { order_id?: string | number; shipment_id?: string | number };
  }>(orderPath, {
    method: "POST",
    body: JSON.stringify(makeShiprocketOrderBody(input, pickup, international)),
  });
  const created = getCreatedOrder(orderPayload);
  const quotePath = international
    ? "/international/courier/serviceability"
    : "/courier/serviceability/";
  const query = new URLSearchParams({
    order_id: created.orderId,
    weight: String(input.weightKg),
    cod: "0",
    pickup_postcode: getConfiguredPickupPostcode(),
    ...(international
      ? { delivery_country: input.destination.countryCode }
      : { delivery_postcode: input.destination.postalCode }),
  });
  const serviceability = await request<{
    currency?: string;
    data?: { available_courier_companies?: ShiprocketCourier[] } | ShiprocketCourier[];
  }>(`${quotePath}?${query.toString()}`, { method: "GET" });
  if (serviceability.currency?.toUpperCase() !== "INR") {
    throw new ShiprocketError("Shiprocket did not return a supported INR shipping quote.");
  }
  const selected = selectLowestCourier(parseCouriers(serviceability));
  return {
    orderId: created.orderId,
    shipmentId: created.shipmentId,
    ...selected,
    currencyCode: "INR",
  };
}

export async function bookShiprocketPackage(input: {
  shipmentId: string;
  courierId: string;
  international: boolean;
}): Promise<{ awbCode: string; trackingUrl?: string }> {
  const path = input.international
    ? "/international/courier/assign/awb"
    : "/courier/assign/awb";
  const payload = await request<{
    response?: {
      data?: { awb_code?: string; tracking_url?: string };
    };
    awb_code?: string;
    tracking_url?: string;
  }>(path, {
    method: "POST",
    body: JSON.stringify({
      shipment_id: Number(input.shipmentId),
      courier_id: Number(input.courierId),
    }),
  });
  const awbCode = payload.response?.data?.awb_code ?? payload.awb_code;
  if (!awbCode) throw new ShiprocketError("Shiprocket did not confirm an AWB booking.");
  return {
    awbCode,
    ...(payload.response?.data?.tracking_url ?? payload.tracking_url
      ? { trackingUrl: payload.response?.data?.tracking_url ?? payload.tracking_url }
      : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : null;
}

function toIsoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/, "$1T$2");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeTrackingUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type ShiprocketTrackingWebhook = {
  awbCode: string | null;
  shipmentId: string | null;
  orderId: string | null;
  tracking: ShiprocketTracking;
};

export function parseShiprocketTrackingWebhook(
  payload: Record<string, unknown>,
): ShiprocketTrackingWebhook {
  const root = record(payload);
  const data = record(root.tracking_data ?? root.data ?? root);
  const latestTrack = record(Array.isArray(data.shipment_track) ? data.shipment_track[0] : null);
  const awbCode = text(data.awb) ??
    text(data.awb_code) ??
    text(latestTrack.awb_code) ??
    text(root.awb) ??
    text(root.awb_code);
  const shipmentId = text(data.shipment_id) ?? text(data.shipmentId) ??
    text(root.shipment_id) ?? text(root.shipmentId);
  const orderId = text(data.order_id) ?? text(data.orderId) ??
    text(root.order_id) ?? text(root.orderId);
  const rawShipmentStatus = text(data.shipment_status);
  const statusCode = text(data.shipment_status_id) ??
    text(data.status_id) ??
    text(data.status_code) ??
    text(latestTrack.shipment_status_id) ??
    text(latestTrack.status_id) ??
    (rawShipmentStatus && /^\d+$/.test(rawShipmentStatus) ? rawShipmentStatus : null) ??
    (text(latestTrack.shipment_status) && /^\d+$/.test(text(latestTrack.shipment_status)!)
      ? text(latestTrack.shipment_status)
      : null);
  const activityValue = data.shipment_track_activities ??
    data.tracking_activity ??
    data.activities ??
    data.activity;
  const rawActivities = Array.isArray(activityValue)
    ? activityValue
    : activityValue && typeof activityValue === "object"
      ? [activityValue]
      : typeof activityValue === "string"
        ? [{ activity: activityValue }]
        : [];
  const currentStatus = text(data.current_status) ??
    text(data.currentStatus) ??
    text(data.status_label) ??
    text(data.status) ??
    text(latestTrack.current_status) ??
    text(latestTrack.status) ??
    (text(latestTrack.shipment_status) && !/^\d+$/.test(text(latestTrack.shipment_status)!)
      ? text(latestTrack.shipment_status)
      : null);
  const events = rawActivities.flatMap((rawEvent): ShiprocketTrackingEvent[] => {
    const event = record(rawEvent);
    const description = text(event.activity) ??
      text(event.description) ??
      text(event.remark) ??
      text(event["sr-status-label"]) ??
      text(event.status);
    if (!description) return [];
    return [{
      occurredAt: toIsoDate(event.date ?? event.timestamp ?? event.occurred_at),
      status: text(event["sr-status-label"]) ?? text(event.status) ?? currentStatus ?? description,
      description,
      location: text(event.location),
      statusCode: statusCode ??
        text(event["sr-status"]) ??
        text(event.status_id) ??
        text(event.status_code),
    }];
  }).sort((left, right) => (left.occurredAt ?? "").localeCompare(right.occurredAt ?? ""));
  const status = currentStatus && !/^\d+$/.test(currentStatus)
    ? currentStatus
    : events.at(-1)?.status ??
    (statusCode ? `Shipment status ${statusCode}` : null) ??
    "Tracking update unavailable";

  if (currentStatus && !events.some((event) => event.status.toLowerCase() === currentStatus.toLowerCase())) {
    events.push({
      occurredAt: toIsoDate(data.status_date ?? data.updated_at ?? root.timestamp),
      status: currentStatus,
      description: currentStatus,
      location: text(data.location),
      statusCode,
    });
  }

  const tracking: ShiprocketTracking = {
    status,
    statusCode,
    awbCode: awbCode ?? "",
    courierName: text(data.courier_name) ??
      text(data.courier_company_name) ??
      text(latestTrack.courier_name) ??
      text(latestTrack.courier_company_name),
    trackingUrl: safeTrackingUrl(data.track_url ?? data.tracking_url ?? latestTrack.track_url ?? latestTrack.tracking_url),
    estimatedDeliveryAt: toIsoDate(data.etd ?? latestTrack.etd),
    events,
  };

  return { awbCode, shipmentId, orderId, tracking };
}

export function normalizeShiprocketTracking(
  payload: Record<string, unknown>,
  expectedAwbCode: string,
): ShiprocketTracking {
  const tracking = record(payload.tracking_data ?? payload);
  const latestTrack = record(Array.isArray(tracking.shipment_track) ? tracking.shipment_track[0] : null);
  const code = text(tracking.shipment_status ?? latestTrack.shipment_status);
  const status =
    text(latestTrack.current_status) ??
    text(tracking.current_status) ??
    (code ? `Shipment status ${code}` : "Tracking update unavailable");
  const rawEvents = Array.isArray(tracking.shipment_track_activities)
    ? tracking.shipment_track_activities
    : [];
  const events = rawEvents.flatMap((rawEvent): ShiprocketTrackingEvent[] => {
    const event = record(rawEvent);
    const description = text(event.activity) ?? text(event["sr-status-label"]) ?? text(event.status);
    if (!description) return [];
    return [{
      occurredAt: toIsoDate(event.date),
      status: text(event["sr-status-label"]) ?? text(event.status) ?? description,
      description,
      location: text(event.location),
      statusCode: text(event["sr-status"]) ?? text(event.status_id) ?? text(event.status_code),
    }];
  }).sort((left, right) => (left.occurredAt ?? "").localeCompare(right.occurredAt ?? ""));

  return {
    status,
    statusCode: code,
    awbCode: text(latestTrack.awb_code) ?? expectedAwbCode,
    courierName: text(latestTrack.courier_name) ?? text(latestTrack.courier_company_name),
    trackingUrl: safeTrackingUrl(tracking.track_url ?? latestTrack.tracking_url),
    estimatedDeliveryAt: toIsoDate(tracking.etd ?? latestTrack.etd),
    events,
  };
}

function normalizedEvent(event: ShiprocketTrackingEvent): ShiprocketTrackingEvent {
  return {
    occurredAt: toIsoDate(event.occurredAt),
    status: event.status.trim(),
    description: event.description.trim(),
    location: event.location?.trim() || null,
    ...(event.statusCode ? { statusCode: event.statusCode.trim() } : {}),
  };
}

function trackingEventKey(event: ShiprocketTrackingEvent): string {
  return [
    event.occurredAt ?? "",
    event.status.toLocaleLowerCase(),
    event.description.toLocaleLowerCase(),
    event.location?.toLocaleLowerCase() ?? "",
  ].join("\u001f");
}

function latestEventTime(events: ShiprocketTrackingEvent[]): number | null {
  let latest: number | null = null;
  for (const event of events) {
    if (!event.occurredAt) continue;
    const time = Date.parse(event.occurredAt);
    if (!Number.isFinite(time)) continue;
    if (latest === null || time > latest) latest = time;
  }
  return latest;
}

export function mergeShiprocketTrackingSnapshot(
  current: { status: string | null; events: ShiprocketTrackingEvent[] },
  incoming: ShiprocketTracking,
): ShiprocketTracking {
  const mergedByKey = new Map<string, ShiprocketTrackingEvent>();
  for (const event of [...current.events, ...incoming.events]) {
    const normalized = normalizedEvent(event);
    if (!normalized.status && !normalized.description) continue;
    const key = trackingEventKey(normalized);
    if (!mergedByKey.has(key)) mergedByKey.set(key, normalized);
  }
  const events = [...mergedByKey.values()].sort((left, right) => {
    if (!left.occurredAt && !right.occurredAt) return trackingEventKey(left).localeCompare(trackingEventKey(right));
    if (!left.occurredAt) return -1;
    if (!right.occurredAt) return 1;
    return left.occurredAt.localeCompare(right.occurredAt);
  });
  const currentLatest = latestEventTime(current.events);
  const incomingLatest = latestEventTime(incoming.events);
  const incomingIsOlder = currentLatest !== null &&
    (incomingLatest === null || incomingLatest < currentLatest);

  return {
    ...incoming,
    status: incomingIsOlder && current.status ? current.status : incoming.status,
    events,
  };
}

export async function getShiprocketTracking(awbCode: string): Promise<ShiprocketTracking> {
  const normalizedAwb = awbCode.trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(normalizedAwb)) {
    throw new ShiprocketError("Shiprocket returned an invalid tracking reference.");
  }
  const payload = await request<Record<string, unknown>>(
    `/courier/track/awb/${encodeURIComponent(normalizedAwb)}`,
    { method: "GET" },
  );
  const tracking = normalizeShiprocketTracking(payload, normalizedAwb);
  if (tracking.awbCode.toUpperCase() !== normalizedAwb.toUpperCase()) {
    throw new ShiprocketError("Shiprocket returned tracking for a different AWB.");
  }
  return tracking;
}

export function getConfiguredParcel() {
  return getParcelDimensions();
}
