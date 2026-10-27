type ShopifyConnectionSettings = {
  shop_domain?: string;
  storefront_access_token?: string;
};

type ShopifyConnectionResponse = {
  items?: Array<{ settings?: ShopifyConnectionSettings }>;
};

type ShopifyStorefrontConfig = {
  shopDomain: string;
  storefrontAccessToken: string;
};

const STOREFRONT_API_VERSION = "2026-04";
const CONNECTION_CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

let cachedConfig:
  | { value: ShopifyStorefrontConfig; expiresAt: number }
  | undefined;

async function getShopifyConfig(forceRefresh = false) {
  if (cachedConfig && !forceRefresh && Date.now() < cachedConfig.expiresAt) {
    return cachedConfig.value;
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const token = process.env["REPL_IDENTITY"]
    ? `repl ${process.env["REPL_IDENTITY"]}`
    : process.env["WEB_REPL_RENEWAL"]
      ? `depl ${process.env["WEB_REPL_RENEWAL"]}`
      : null;

  if (!hostname || !token) {
    throw new Error("Shopify connector environment is unavailable");
  }

  const protocol = hostname.startsWith("localhost") ? "http" : "https";
  const connectionUrl = new URL(`${protocol}://${hostname}/api/v2/connection`);
  connectionUrl.searchParams.set("include_secrets", "true");
  connectionUrl.searchParams.set("connector_names", "shopify-store");
  connectionUrl.searchParams.set("refresh_policy", "none");

  const response = await fetch(connectionUrl, {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: token,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Shopify connection lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as ShopifyConnectionResponse;
  const settings = payload.items?.[0]?.settings;
  if (!settings?.shop_domain || !settings.storefront_access_token) {
    throw new Error("Shopify Storefront settings are not provisioned");
  }

  const config = {
    shopDomain: settings.shop_domain,
    storefrontAccessToken: settings.storefront_access_token,
  };
  cachedConfig = {
    value: config,
    expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
  };
  return config;
}

export async function shopifyStorefrontRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  retryOnUnauthorized = true,
): Promise<T> {
  const config = await getShopifyConfig();
  const response = await fetch(
    `https://${config.shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (
    retryOnUnauthorized &&
    (response.status === 401 || response.status === 403)
  ) {
    cachedConfig = undefined;
    await getShopifyConfig(true);
    return shopifyStorefrontRequest<T>(query, variables, false);
  }

  const body = await response.text();
  let payload: { data?: T; errors?: Array<{ message: string }> };
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(`Shopify returned an unreadable response (${response.status})`);
  }

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      `Shopify Storefront API request failed (${response.status})`,
    );
  }

  return payload.data;
}
