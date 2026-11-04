import { directShopifyConfig } from "./directShopifyConfig";

let cached: { token: string; expiresAt: number } | undefined;
let refreshing: Promise<string> | undefined;

async function refreshToken() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Set Shopify app client credentials or SHOPIFY_ADMIN_ACCESS_TOKEN.");
  const response = await fetch(`https://${directShopifyConfig().shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Shopify app authentication failed (${response.status}). Check app installation and access scopes.`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token || !data.expires_in || data.expires_in < 60) throw new Error("Shopify did not return a valid app token.");
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

/** New Dev Dashboard apps use expiring client-credentials tokens; legacy tokens remain supported. */
export async function getDirectShopifyAdminToken() {
  const staticToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (staticToken) return staticToken;
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (!refreshing) refreshing = refreshToken().finally(() => { refreshing = undefined; });
  return refreshing;
}

export function invalidateShopifyAdminToken() { cached = undefined; }
