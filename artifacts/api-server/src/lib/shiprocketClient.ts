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
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export class ShiprocketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiprocketError";
  }
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
      throw new ShiprocketError(`Shiprocket authentication failed (${response.status}).`);
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
    throw new ShiprocketError(`Shiprocket request failed (${response.status}).`);
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
    data?: ShiprocketPickup[] | { data?: ShiprocketPickup[] };
  }>("/settings/company/pickup");
  const data = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.data)
      ? payload.data.data
      : [];
  const requestedPostcode = getConfiguredPickupPostcode();
  const pickup = data.find((item) =>
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
    data?: { available_courier_companies?: ShiprocketCourier[] } | ShiprocketCourier[];
  }>(`${quotePath}?${query.toString()}`, { method: "GET" });
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

export function getConfiguredParcel() {
  return getParcelDimensions();
}
