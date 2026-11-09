export const shipmentLifecycleStatuses = [
  "quoted",
  "booking_pending",
  "booked",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "booking_failed",
  "cancelled",
  "returned",
] as const;

export type ShipmentLifecycleStatus = typeof shipmentLifecycleStatuses[number];

const progressRank: Record<ShipmentLifecycleStatus, number> = {
  quoted: 0,
  booking_pending: 1,
  booking_failed: 1,
  booked: 2,
  pickup_scheduled: 3,
  picked_up: 4,
  in_transit: 5,
  out_for_delivery: 6,
  delivered: 7,
  returned: 8,
  cancelled: 9,
};

const shipmentProgressStatuses = new Set<ShipmentLifecycleStatus>([
  "booked",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
]);
const activeTrackingStatuses = new Set<ShipmentLifecycleStatus>([
  "booked",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
]);

export function normalizeShipmentLifecycleStatus(
  status: string | null | undefined,
): ShipmentLifecycleStatus | null {
  if (status === "failed") return "booking_failed";
  return shipmentLifecycleStatuses.includes(status as ShipmentLifecycleStatus)
    ? status as ShipmentLifecycleStatus
    : null;
}

export function shipmentLifecycleFromTracking(
  status: string | null | undefined,
  statusCode: string | null | undefined,
): ShipmentLifecycleStatus | null {
  const normalized = (status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (/\b(book(?:ing)? failed|awb failed|assignment failed)\b/.test(normalized)) {
    return "booking_failed";
  }
  if (/\b(cancel|cancelled|canceled)\b/.test(normalized)) return "cancelled";
  if (/\b(rto|return(?:ed)? to (?:origin|sender)|returned)\b/.test(normalized)) {
    return "returned";
  }
  if (/\b(delivered|delivery completed)\b/.test(normalized)) return "delivered";
  if (/\bout for delivery\b/.test(normalized)) return "out_for_delivery";
  if (/\b(picked up|pickup completed|picked by courier)\b/.test(normalized)) {
    return "picked_up";
  }
  if (/\b(pickup scheduled|pickup generated|pickup queued|pickup requested|ready for pickup)\b/.test(normalized)) {
    return "pickup_scheduled";
  }
  if (/\b(in transit|shipped|dispatched|departed|connected|arrived at hub|reached hub)\b/.test(normalized)) {
    return "in_transit";
  }
  if (/\b(awb assigned|awb generated|waybill generated|shipment booked|ready to ship|booked)\b/.test(normalized)) {
    return "booked";
  }
  // Shiprocket's downloaded sample identifies status ID 7 as Delivered.
  if (statusCode === "7") return "delivered";
  return null;
}

export function isShipmentProgressStatus(
  status: string | null | undefined,
): boolean {
  const normalized = normalizeShipmentLifecycleStatus(status);
  return normalized ? shipmentProgressStatuses.has(normalized) : false;
}

export function isShipmentBookedOrBeyond(
  status: string | null | undefined,
): boolean {
  const normalized = normalizeShipmentLifecycleStatus(status);
  return Boolean(normalized && (
    shipmentProgressStatuses.has(normalized) ||
    normalized === "cancelled"
  ));
}

export function advanceShipmentLifecycle(
  currentStatus: string | null | undefined,
  incomingStatus: ShipmentLifecycleStatus | null,
  hasConfirmedAwb: boolean,
): ShipmentLifecycleStatus {
  const current = normalizeShipmentLifecycleStatus(currentStatus) ?? "quoted";
  if (!incomingStatus) return current;

  if (current === "delivered" || current === "returned" || current === "cancelled") {
    if (current === "cancelled" && incomingStatus === "returned" && hasConfirmedAwb) {
      return "returned";
    }
    return current;
  }

  if (
    shipmentProgressStatuses.has(incomingStatus) &&
    !hasConfirmedAwb
  ) {
    return current;
  }

  return progressRank[incomingStatus] >= progressRank[current]
    ? incomingStatus
    : current;
}

export function shipmentLifecycleLabel(status: string | null | undefined): string {
  switch (normalizeShipmentLifecycleStatus(status)) {
    case "quoted": return "Shipping quote ready";
    case "booking_pending": return "Shipment booking pending";
    case "booked": return "Shipment booked";
    case "pickup_scheduled": return "Pickup scheduled";
    case "picked_up": return "Picked up";
    case "in_transit": return "In transit";
    case "out_for_delivery": return "Out for delivery";
    case "delivered": return "Delivered";
    case "booking_failed": return "Shipment booking needs attention";
    case "cancelled": return "Shipment cancelled";
    case "returned": return "Returned to sender";
    default: return "Shipment update unavailable";
  }
}
