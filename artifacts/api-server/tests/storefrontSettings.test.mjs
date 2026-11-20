import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  stdin: {
    contents: `
      import settingsRouter from "./src/routes/storefrontSettings.ts";
      import { store } from "@workspace/db";
      export { settingsRouter, store };
    `,
    resolveDir: new URL("../", import.meta.url).pathname,
    sourcefile: "storefront-settings-harness.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "storefront-settings-test-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "drizzle", namespace: "test" }));
      builder.onResolve({ filter: /merchantAdminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          db: `
            let saved = null;
            const store = { get value() { return saved; }, clear() { saved = null; } };
            const storefrontReturnSettingsTable = {
              id: { name: "id" },
              returnWindowDays: { name: "returnWindowDays" },
            };
            const db = {
              select: () => ({
                from: () => ({
                  where: () => ({
                    limit: async () => saved ? [{ returnWindowDays: saved.returnWindowDays }] : [],
                  }),
                }),
              }),
              insert: () => ({
                values: (row) => ({
                  onConflictDoUpdate: ({ set }) => {
                    saved = { ...row, ...set };
                    return {
                      returning: async () => [{ returnWindowDays: saved.returnWindowDays }],
                    };
                  },
                }),
              }),
            };
            export { db, store, storefrontReturnSettingsTable };
          `,
          drizzle: `export const eq = (column, value) => ({ column, value });`,
          auth: `export const requireMerchantAdmin = (req, res, next) => req.get("x-test-admin") === "yes" ? next() : res.status(403).json({ error: "Forbidden" });`,
        }[path],
      }));
    },
  }],
});

const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { settingsRouter, store } = module.exports;

test("public return settings default to four days and authorized admin updates are validated", async (t) => {
  store.clear();
  const app = express();
  app.use(express.json());
  app.use("/api", settingsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api/storefront-settings`;

  const initialResponse = await fetch(base);
  assert.equal(initialResponse.status, 200);
  assert.deepEqual(await initialResponse.json(), { returnWindowDays: 4 });

  const forbiddenResponse = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnWindowDays: 7 }),
  });
  assert.equal(forbiddenResponse.status, 403);

  const invalidResponse = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-test-admin": "yes" },
    body: JSON.stringify({ returnWindowDays: 2147483648 }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(store.value, null);

  const customResponse = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-test-admin": "yes" },
    body: JSON.stringify({ returnWindowDays: 45 }),
  });
  assert.equal(customResponse.status, 200);
  assert.deepEqual(await customResponse.json(), { returnWindowDays: 45 });

  const updateResponse = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-test-admin": "yes" },
    body: JSON.stringify({ returnWindowDays: 12 }),
  });
  assert.equal(updateResponse.status, 200);
  assert.deepEqual(await updateResponse.json(), { returnWindowDays: 12 });

  const publicResponse = await fetch(base);
  assert.deepEqual(await publicResponse.json(), { returnWindowDays: 12 });

  const disableResponse = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-test-admin": "yes" },
    body: JSON.stringify({ returnWindowDays: 0 }),
  });
  assert.equal(disableResponse.status, 200);
  assert.deepEqual(await disableResponse.json(), { returnWindowDays: 0 });
});
