import { ReplitConnectors } from "@replit/connectors-sdk";

const ADMIN_API_VERSION = "2026-04";
const connectors = new ReplitConnectors();

type ShopifyGraphQLError = { message?: string };
type ShopifyGraphQLResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[];
};

export class ShopifyAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyAdminError";
  }
}

export class ShopifyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyInputError";
  }
}

export async function shopifyAdminRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await connectors.proxy(
    "shopify-store",
    `/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );

  let payload: ShopifyGraphQLResponse<T>;
  try {
    payload = (await response.json()) as ShopifyGraphQLResponse<T>;
  } catch {
    throw new ShopifyAdminError("Shopify returned an unreadable response.");
  }

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new ShopifyAdminError(
      payload.errors?.[0]?.message || "Shopify could not complete the request.",
    );
  }

  return payload.data;
}

export function assertNoUserErrors(
  userErrors: Array<{ message: string }> | null | undefined,
): void {
  const firstMessage = userErrors?.[0]?.message;
  if (firstMessage) throw new ShopifyInputError(firstMessage);
}

export function escapeProductDescription(value: string): string {
  return value
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function normalizeProductDescription(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function validatePublicImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new ShopifyInputError("Enter a valid public image URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".local")
  ) {
    throw new ShopifyInputError(
      "Product images must use a public HTTPS URL.",
    );
  }
}

export function isShopifyProductId(id: string): boolean {
  return /^gid:\/\/shopify\/Product\/\d+$/.test(id);
}

export function isShopifyDiscountId(id: string): boolean {
  return /^gid:\/\/shopify\/DiscountCodeNode\/\d+$/.test(id);
}
