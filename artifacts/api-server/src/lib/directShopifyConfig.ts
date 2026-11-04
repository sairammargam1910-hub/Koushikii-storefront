export function usesDirectShopify() {
  const mode = process.env.SHOPIFY_CONNECTION_MODE || "replit";
  if (mode !== "replit" && mode !== "direct") throw new Error("Invalid SHOPIFY_CONNECTION_MODE.");
  return mode === "direct";
}

export function directShopifyConfig() {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN?.trim().toLowerCase();
  if (!shopDomain || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
    throw new Error("SHOPIFY_SHOP_DOMAIN must be the store's hostname ending in .myshopify.com.");
  }
  return { shopDomain };
}

export function directShopifyToken(kind: "ADMIN" | "STOREFRONT") {
  const token = process.env[`SHOPIFY_${kind}_ACCESS_TOKEN`]?.trim();
  if (!token) throw new Error(`Missing SHOPIFY_${kind}_ACCESS_TOKEN.`);
  return token;
}
