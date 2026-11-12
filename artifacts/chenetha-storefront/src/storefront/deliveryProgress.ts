export const deliveryProgressStages = [
  "Shipment booked",
  "Picked up",
  "In transit",
  "Out for delivery",
  "Delivered",
] as const;

export type DeliveryProgress =
  | { kind: "progress"; currentStep: number; label: string; message: string }
  | { kind: "preparing"; label: string; message: string }
  | { kind: "attention"; label: string; message: string }
  | { kind: "payment_required"; label: string; message: string }
  | { kind: "waiting"; label: string; message: string };

export interface DeliveryProgressInput {
  paymentConfirmed: boolean;
  shipmentStatus: string | null | undefined;
  status: string | null | undefined;
  latestEvent?: { status?: string | null; description?: string | null } | null;
}

function inferProgressStep(value: string): number | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ");

  if (/\b(delivered|delivery complete|successfully delivered)\b/.test(normalized)) return 4;
  if (/\b(out for delivery|delivery in progress)\b/.test(normalized)) return 3;
  if (/\b(in transit|in network|arrived at hub|departed|further connected|transported)\b/.test(normalized)) return 2;
  if (/\b(picked up|pickup done|shipment picked|handed to courier|collected)\b/.test(normalized)) return 1;
  if (/\b(out for pickup|ready for pickup|shipment booked|booked|awb assigned|manifest created)\b/.test(normalized)) return 0;

  return null;
}

export function resolveDeliveryProgress(input: DeliveryProgressInput): DeliveryProgress {
  if (!input.paymentConfirmed) {
    return {
      kind: "payment_required",
      label: "Delivery tracking not started",
      message: "Delivery tracking will appear after payment is confirmed.",
    };
  }

  const lifecycle = input.shipmentStatus?.toLowerCase() ?? "";
  switch (lifecycle) {
    case "quoted":
    case "booking_pending":
      return {
        kind: "preparing",
        label: "Preparing your parcel",
        message: "Courier tracking begins once the shipment is booked.",
      };
    case "booking_failed":
      return {
        kind: "attention",
        label: "Delivery update pending",
        message: "We’re checking the delivery arrangements. Tracking will appear when the courier accepts the parcel.",
      };
    case "cancelled":
      return {
        kind: "attention",
        label: "Delivery arrangement ended",
        message: "Please contact us if you need help with this delivery.",
      };
    case "returned":
      return {
        kind: "attention",
        label: "Parcel returning",
        message: "Your parcel is being returned. Please contact us if you need help.",
      };
    case "booked":
    case "pickup_scheduled":
      return {
        kind: "progress",
        currentStep: 0,
        label: deliveryProgressStages[0],
        message: "Your parcel is being prepared for pickup.",
      };
    case "picked_up":
      return {
        kind: "progress",
        currentStep: 1,
        label: deliveryProgressStages[1],
        message: "The courier has collected your parcel.",
      };
    case "in_transit":
      return {
        kind: "progress",
        currentStep: 2,
        label: deliveryProgressStages[2],
        message: "Your parcel is moving toward its destination.",
      };
    case "out_for_delivery":
      return {
        kind: "progress",
        currentStep: 3,
        label: deliveryProgressStages[3],
        message: "Your parcel is on its way to you today.",
      };
    case "delivered":
      return {
        kind: "progress",
        currentStep: 4,
        label: deliveryProgressStages[4],
        message: "Your parcel has been delivered.",
      };
  }

  const inferredStep = inferProgressStep(
    [input.status, input.latestEvent?.status, input.latestEvent?.description]
      .filter(Boolean)
      .join(" "),
  );
  if (inferredStep !== null) {
    return {
      kind: "progress",
      currentStep: inferredStep,
      label: deliveryProgressStages[inferredStep],
      message: inferredStep === 4
        ? "Your parcel has been delivered."
        : "The courier will share more updates as your parcel moves.",
    };
  }

  return {
    kind: "waiting",
    label: "Waiting for courier updates",
    message: "Your latest courier update will appear here when available.",
  };
}
