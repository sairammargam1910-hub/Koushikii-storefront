import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontPromotionsTable = pgTable("storefront_discount_promotions", {
  discountId: text("discount_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StorefrontPromotion = typeof storefrontPromotionsTable.$inferSelect;
