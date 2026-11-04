import { spawn } from "node:child_process";

const env = {
  ...process.env,
  NODE_ENV: "production",
  SERVE_STOREFRONT: "true",
  CLERK_AUTH_MODE: "external",
  SHOPIFY_CONNECTION_MODE: "direct",
  SITE_MEDIA_STORAGE: "r2",
};
const required = [
  "PORT", "DATABASE_URL", "APP_ORIGIN", "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY", "MERCHANT_ADMIN_EMAIL", "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN", "SHOPIFY_PUBLICATION_ID",
  "R2_ENDPOINT", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
];
const missing = required.filter(key => !env[key]?.trim());
if (missing.length) throw new Error(`Missing Railway variables: ${missing.join(", ")}`);
if (!env.SHOPIFY_ADMIN_ACCESS_TOKEN && !(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)) {
  throw new Error("Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or a legacy SHOPIFY_ADMIN_ACCESS_TOKEN.");
}
const origin = new URL(env.APP_ORIGIN);
if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN) {
  throw new Error("APP_ORIGIN must be an HTTPS origin without a trailing slash or path.");
}
const server = spawn(process.execPath, ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], {
  env, stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
