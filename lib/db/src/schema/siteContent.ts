import { createInsertSchema } from "drizzle-zod";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const siteContentKindEnum = pgEnum("site_content_kind", [
  "hero_slide",
  "home_image",
  "customer_voice",
  "video_post",
]);
export const siteContentPlacementEnum = pgEnum("site_content_placement", [
  "fabric_tile",
  "weave_tile",
]);

export const siteContentTable = pgTable("site_content_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: siteContentKindEnum("kind").notNull(),
  placement: siteContentPlacementEnum("placement"),
  title: text("title").notNull(),
  eyebrow: text("eyebrow"),
  body: text("body"),
  imageUrl: text("image_url"),
  mediaUrl: text("media_url"),
  altText: text("alt_text"),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  linkedProductId: text("linked_product_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("site_content_kind_order_idx").on(table.kind, table.sortOrder),
  index("site_content_publication_idx").on(table.published, table.approved),
]);

export const insertSiteContentSchema = createInsertSchema(siteContentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSiteContent = z.infer<typeof insertSiteContentSchema>;
export type SiteContent = typeof siteContentTable.$inferSelect;
