import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontReturnSettingsTable = pgTable("storefront_return_settings", {
  id: text("id").primaryKey().default("storefront"),
  returnWindowDays: integer("return_window_days").notNull().default(4),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("storefront_return_settings_singleton_check", sql`${table.id} = 'storefront'`),
  check("storefront_return_window_days_check", sql`${table.returnWindowDays} >= 0 AND ${table.returnWindowDays} <= 30`),
]);

export type StorefrontReturnSettings = typeof storefrontReturnSettingsTable.$inferSelect;
