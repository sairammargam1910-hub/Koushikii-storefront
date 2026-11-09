import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cashfreeCheckoutStatusEnum = pgEnum("cashfree_checkout_status", [
  "quote_ready",
  "payment_pending",
  "payment_failed",
  "paid",
  "shopify_sync_pending",
  "shopify_synced",
  "shipment_booking_pending",
  "completed",
  "refund_pending",
  "refunded",
  "reconciliation_required",
]);

export const checkoutShipmentStatusEnum = pgEnum("checkout_shipment_status", [
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
  // Preserve existing rows while older deployments finish rolling forward.
  "failed",
]);

export const checkoutPaymentStatusEnum = pgEnum("checkout_payment_status", [
  "not_started",
  "pending",
  "paid",
  "failed",
  "refund_pending",
  "refunded",
  "reconciliation_required",
]);

export const checkoutCartCleanupStatusEnum = pgEnum("checkout_cart_cleanup_status", [
  "not_started",
  "processing",
  "completed",
  "failed",
]);

export const cashfreeCheckoutOrdersTable = pgTable("cashfree_checkout_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  cashfreeOrderId: text("cashfree_order_id").notNull().unique(),
  status: cashfreeCheckoutStatusEnum("status").notNull().default("quote_ready"),
  paymentStatus: checkoutPaymentStatusEnum("payment_status").notNull().default("not_started"),
  quoteHash: text("quote_hash").notNull(),
  cartId: text("cart_id").notNull(),
  purchasedCartLines: jsonb("purchased_cart_lines")
    .$type<Array<{ id: string; quantity: number }>>()
    .notNull()
    .default([]),
  cartCleanupStatus: checkoutCartCleanupStatusEnum("cart_cleanup_status")
    .notNull()
    .default("not_started"),
  destinationCountryCode: text("destination_country_code").notNull(),
  currencyCode: text("currency_code").notNull(),
  itemSubtotal: numeric("item_subtotal", { precision: 16, scale: 4 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 16, scale: 4 }).notNull(),
  shippingAmount: numeric("shipping_amount", { precision: 16, scale: 4 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 16, scale: 4 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 16, scale: 4 }).notNull(),
  quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }).notNull(),
  checkoutSnapshot: jsonb("checkout_snapshot").notNull(),
  paymentSessionId: text("payment_session_id"),
  paymentReference: text("payment_reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  shopifyOrderId: text("shopify_order_id"),
  shopifyOrderName: text("shopify_order_name"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("cashfree_checkout_status_expiry_idx").on(table.status, table.quoteExpiresAt),
  index("cashfree_checkout_cart_idx").on(table.cartId, table.createdAt),
]);

export const checkoutShipmentPackagesTable = pgTable("cashfree_checkout_shipment_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkoutOrderId: uuid("checkout_order_id")
    .notNull()
    .references(() => cashfreeCheckoutOrdersTable.id, { onDelete: "cascade" }),
  packageIndex: integer("package_index").notNull(),
  shiprocketOrderId: text("shiprocket_order_id").unique(),
  shiprocketShipmentId: text("shiprocket_shipment_id"),
  courierId: text("courier_id").notNull(),
  courierName: text("courier_name").notNull(),
  quotedAmount: numeric("quoted_amount", { precision: 16, scale: 4 }).notNull(),
  status: checkoutShipmentStatusEnum("status").notNull().default("quoted"),
  awbCode: text("awb_code"),
  trackingUrl: text("tracking_url"),
  trackingStatus: text("tracking_status"),
  trackingEvents: jsonb("tracking_events")
    .$type<Array<{
      occurredAt: string | null;
      status: string;
      description: string;
      location: string | null;
      statusCode?: string | null;
    }>>()
    .notNull()
    .default([]),
  estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
  trackingUpdatedAt: timestamp("tracking_updated_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("cashfree_checkout_shipment_package_idx").on(table.checkoutOrderId, table.packageIndex),
  index("cashfree_checkout_shipment_status_idx").on(table.checkoutOrderId, table.status),
]);

export const insertCashfreeCheckoutOrderSchema = createInsertSchema(cashfreeCheckoutOrdersTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCashfreeCheckoutOrder = z.infer<typeof insertCashfreeCheckoutOrderSchema>;
export type CashfreeCheckoutOrder = typeof cashfreeCheckoutOrdersTable.$inferSelect;

export const insertCheckoutShipmentPackageSchema = createInsertSchema(checkoutShipmentPackagesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCheckoutShipmentPackage = z.infer<typeof insertCheckoutShipmentPackageSchema>;
export type CheckoutShipmentPackage = typeof checkoutShipmentPackagesTable.$inferSelect;
