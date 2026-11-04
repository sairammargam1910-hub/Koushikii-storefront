import { spawnSync } from "node:child_process";

// Only build this product, not the Design Canvas or unrelated workspace artifacts.
const env = {
  ...process.env,
  NODE_ENV: "production",
  BASE_PATH: "/",
  PORT: process.env.PORT || "3000",
  VITE_CLERK_AUTH_MODE: "external",
};
if (!env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY in Railway before building.");
}
for (const args of [
  ["run", "typecheck:libs"],
  ["--filter", "@workspace/chenetha-storefront", "run", "typecheck"],
  ["--filter", "@workspace/api-server", "run", "typecheck"],
  ["--filter", "@workspace/chenetha-storefront", "run", "build"],
  ["--filter", "@workspace/api-server", "run", "build"],
]) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
