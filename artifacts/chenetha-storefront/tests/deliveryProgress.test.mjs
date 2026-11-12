import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDeliveryProgress } from "../src/storefront/deliveryProgress.ts";

const paid = (shipmentStatus, status = "Unknown", latestEvent = null) =>
  resolveDeliveryProgress({ paymentConfirmed: true, shipmentStatus, status, latestEvent });

test("does not show a shipment as moving before payment is confirmed", () => {
  const progress = resolveDeliveryProgress({
    paymentConfirmed: false,
    shipmentStatus: "in_transit",
    status: "In Transit",
    latestEvent: { status: "IN TRANSIT" },
  });

  assert.equal(progress.kind, "payment_required");
  assert.equal(progress.label, "Delivery tracking not started");
});

test("quoted and booking-pending shipments remain in preparation", () => {
  for (const shipmentStatus of ["quoted", "booking_pending"]) {
    assert.equal(paid(shipmentStatus, "In Transit").kind, "preparing");
  }
});

test("booked shipment lifecycle states map to truthful milestones", () => {
  const cases = [
    ["booked", 0],
    ["pickup_scheduled", 0],
    ["picked_up", 1],
    ["in_transit", 2],
    ["out_for_delivery", 3],
    ["delivered", 4],
  ];

  for (const [shipmentStatus, currentStep] of cases) {
    const progress = paid(shipmentStatus);
    assert.equal(progress.kind, "progress");
    assert.equal(progress.currentStep, currentStep);
  }
});

test("failed, cancelled and returned shipments do not appear on the delivery rail", () => {
  for (const shipmentStatus of ["booking_failed", "cancelled", "returned"]) {
    assert.equal(paid(shipmentStatus, "In Transit").kind, "attention");
  }
});

test("falls back to the latest recognized courier scan when lifecycle status is absent", () => {
  const progress = paid(null, "NA", { status: "IN TRANSIT", description: "Parcel moving between hubs" });
  assert.equal(progress.kind, "progress");
  assert.equal(progress.currentStep, 2);
});

test("keeps unknown and data-received statuses from implying a shipment stage", () => {
  assert.equal(paid(null, "NA", { status: "DATA RECEIVED" }).kind, "waiting");
  assert.equal(paid(null, "NA", { status: "Something unfamiliar" }).kind, "waiting");
});
