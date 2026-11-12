import { Check, ChevronDown, Clock3, ExternalLink, MapPin, Truck } from "lucide-react";
import type { ShopifyOrderTrackingShipment } from "@workspace/api-client-react";
import { deliveryProgressStages, resolveDeliveryProgress } from "./deliveryProgress";
import { customerFacingMessage } from "./customerFacingMessage";

function formatTrackingDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function shipmentIsActive(shipment: ShopifyOrderTrackingShipment) {
  if (shipment.shipmentStatus) {
    return ["booked", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery"]
      .includes(shipment.shipmentStatus);
  }
  const normalized = (shipment.status ?? "").toLowerCase();
  return Boolean(normalized) && !/(delivered|cancelled|canceled|returned|failed|expired|exception|rto)/.test(normalized);
}

export function ShipmentTrackingProgress({
  shipment,
  index,
  paymentConfirmed,
}: {
  shipment: ShopifyOrderTrackingShipment;
  index: number;
  paymentConfirmed: boolean;
}) {
  const events = [...shipment.events].sort((a, b) =>
    (b.occurredAt ? new Date(b.occurredAt).getTime() : 0) -
    (a.occurredAt ? new Date(a.occurredAt).getTime() : 0),
  );
  const progress = resolveDeliveryProgress({
    paymentConfirmed,
    shipmentStatus: shipment.shipmentStatus,
    status: shipment.status,
    latestEvent: events[0] ? { status: events[0].status, description: events[0].description } : null,
  });
  const isActive = shipmentIsActive(shipment);
  const latestEvent = events[0];
  const latestLocation = latestEvent ? customerFacingMessage(latestEvent.location, "") : "";

  return (
    <div className="shipment-unit" data-testid={`shipment-${index}`}>
      <div className="shipment-status-line">
        <span className={`shipment-status-symbol ${progress.kind === "progress" && progress.currentStep === deliveryProgressStages.length - 1 ? "is-delivered" : ""}`}>
          {progress.kind === "progress" && progress.currentStep === deliveryProgressStages.length - 1
            ? <Check size={15}/>
            : progress.kind === "preparing" || progress.kind === "payment_required"
              ? <Clock3 size={15}/>
              : <Truck size={15}/>}
        </span>
        <div className="shipment-status-copy" aria-live="polite">
          <strong data-testid={`status-shipment-${index}`}>{progress.label}</strong>
          <span>{progress.kind === "progress" ? "Delivery partner" : progress.message}</span>
        </div>
        {shipment.estimatedDeliveryAt && isActive && paymentConfirmed && (
          <span className="shipment-estimate" data-testid={`text-estimated-delivery-${index}`}>
            Estimated {formatTrackingDate(shipment.estimatedDeliveryAt)}
          </span>
        )}
      </div>

      {progress.kind === "progress" && (
        <ol className="shipment-progress" aria-label="Delivery journey" data-testid={`progress-shipment-${index}`}>
          {deliveryProgressStages.map((stage, stageIndex) => {
            const state = stageIndex < progress.currentStep ? "complete" : stageIndex === progress.currentStep ? "current" : "upcoming";
            return (
              <li
                key={stage}
                className={`shipment-progress-step is-${state}${stageIndex > 0 && stageIndex <= progress.currentStep ? " has-complete-connector" : ""}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="shipment-progress-node" aria-hidden="true">
                  {state === "complete" ? <Check size={12}/> : state === "current" ? <i/> : null}
                </span>
                <strong>{stage}</strong>
                <small>{state === "complete" ? "Done" : state === "current" ? "Current" : "Next"}</small>
              </li>
            );
          })}
        </ol>
      )}

      {progress.kind !== "progress" && (events.length === 0 || progress.kind !== "waiting") && (
        <div className={`tracking-notice is-${progress.kind}`} role="status" data-testid={`notice-shipment-${index}`}>
          <Clock3 size={15}/><p>{progress.message}</p>
        </div>
      )}

      {progress.kind !== "payment_required" && shipment.awbCode && (
        <div className="tracking-reference">
          <span>Tracking number <strong data-testid={`text-tracking-number-${index}`}>{shipment.awbCode}</strong></span>
          {shipment.trackingUrl && (
            <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-carrier-tracking-${index}`}>
              View delivery tracking <ExternalLink size={13}/>
            </a>
          )}
        </div>
      )}

      {progress.kind !== "payment_required" && latestEvent ? (
        <>
          <div className="tracking-latest" data-testid={`latest-scan-shipment-${index}`}>
            <span className="tracking-latest-label">Latest courier update</span>
            <strong>{customerFacingMessage(latestEvent.status, "Delivery update")}</strong>
            <p>{customerFacingMessage(latestEvent.description, "Your parcel has a new delivery update.")}</p>
            {(latestEvent.occurredAt || latestLocation) && (
              <small>
                {latestEvent.occurredAt && <time dateTime={latestEvent.occurredAt}>{formatTrackingDate(latestEvent.occurredAt, true)}</time>}
                {latestEvent.occurredAt && latestLocation && <span className="timeline-separator"> · </span>}
                {latestLocation && <span><MapPin size={11}/>{latestLocation}</span>}
              </small>
            )}
          </div>
          <details className="tracking-history" data-testid={`details-shipment-history-${index}`}>
            <summary>
              <span>View all courier scans</span>
              <small>{events.length} {events.length === 1 ? "update" : "updates"}</small>
              <ChevronDown size={16} aria-hidden="true"/>
            </summary>
            <ol className="tracking-timeline" data-testid={`timeline-shipment-${index}`}>
              {events.map((event, eventIndex) => {
                const location = customerFacingMessage(event.location, "");
                return (
                  <li key={`${event.occurredAt ?? event.status}-${eventIndex}`} className={eventIndex === 0 ? "is-current" : ""} data-testid={`event-shipment-${index}-${eventIndex}`}>
                    <span className="timeline-dot"/>
                    <div className="timeline-event-copy">
                      <strong>{customerFacingMessage(event.status, "Delivery update")}</strong>
                      <p>{customerFacingMessage(event.description, "Your parcel has a new delivery update.")}</p>
                      {(event.occurredAt || location) && (
                        <small>
                          {event.occurredAt && <time dateTime={event.occurredAt}>{formatTrackingDate(event.occurredAt, true)}</time>}
                          {event.occurredAt && location && <span className="timeline-separator"> · </span>}
                          {location && <span><MapPin size={11}/>{location}</span>}
                        </small>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </details>
        </>
      ) : progress.kind !== "payment_required" && events.length === 0 ? (
        <p className="tracking-pending" data-testid={`text-tracking-pending-${index}`}>
          <Clock3 size={14}/> Courier scans will appear here as the parcel moves.
        </p>
      ) : null}
    </div>
  );
}
