import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../src/lib/cashfreeClient.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});

function loadModule() {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports;
}

function withEnvironment(values, run) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("creates a hosted sandbox session with server-side idempotency", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      order_id: request.body.order_id,
      order_amount: request.body.order_amount,
      order_currency: request.body.order_currency,
      order_status: "ACTIVE",
      payment_session_id: "session-test",
    }), { status: 200 });
  };
  try {
    await withEnvironment({
      CASHFREE_ENVIRONMENT: "sandbox",
      CHECKOUT_LIVE_ENABLED: null,
      CASHFREE_APP_ID: "sandbox-app-id",
      CASHFREE_SECRET_KEY: "sandbox-secret",
    }, async () => {
      const { createCashfreeOrder } = loadModule();
      const order = await createCashfreeOrder({
        orderId: "chenetha_order123",
        amount: "1234.50",
        currencyCode: "INR",
        email: "buyer@example.com",
        phone: "+919876543210",
        returnUrl: "https://shop.example/Checkout?cashfree_order_id=chenetha_order123",
        expiresAt: "2026-11-07T12:10:00.000Z",
        idempotencyKey: "f991fda7-d46f-4113-a93a-64020aab037a",
      });
      assert.equal(request.url, "https://sandbox.cashfree.com/pg/orders");
      assert.equal(request.init.headers["x-api-version"], "2026-01-01");
      assert.equal(request.init.headers["x-idempotency-key"], "f991fda7-d46f-4113-a93a-64020aab037a");
      assert.equal(request.body.order_amount, 1234.5);
      assert.equal(request.body.customer_details.customer_phone, "919876543210");
      assert.equal(order.payment_session_id, "session-test");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production mode fails closed without the explicit live flag and separate credentials", async () => {
  await withEnvironment({
    CASHFREE_ENVIRONMENT: "production",
    CHECKOUT_LIVE_ENABLED: null,
    CASHFREE_LIVE_APP_ID: null,
    CASHFREE_LIVE_SECRET_KEY: null,
  }, async () => {
    const { getCashfreeEnvironment, createCashfreeOrder } = loadModule();
    assert.throws(() => getCashfreeEnvironment(), /explicitly enables/);
    process.env.CHECKOUT_LIVE_ENABLED = "true";
    assert.equal(getCashfreeEnvironment(), "production");
    await assert.rejects(
      createCashfreeOrder({
        orderId: "chenetha_order123",
        amount: "10.00",
        currencyCode: "INR",
        email: "buyer@example.com",
        phone: "+919876543210",
        returnUrl: "https://shop.example/Checkout",
        expiresAt: "2026-11-07T12:10:00.000Z",
        idempotencyKey: "f991fda7-d46f-4113-a93a-64020aab037a",
      }),
      /Live Cashfree credentials/,
    );
  });
});

test("verifies the webhook signature against the exact timestamp and raw bytes", async () => {
  await withEnvironment({
    CASHFREE_ENVIRONMENT: "sandbox",
    CHECKOUT_LIVE_ENABLED: null,
    CASHFREE_APP_ID: "sandbox-app-id",
    CASHFREE_SECRET_KEY: "sandbox-secret",
  }, async () => {
    const { verifyCashfreeWebhookSignature } = loadModule();
    const timestamp = "1762516800";
    const rawBody = Buffer.from('{"type":"PAYMENT_SUCCESS","data":{"order":{"order_id":"test"}}}');
    const signature = createHmac("sha256", "sandbox-secret")
      .update(timestamp, "utf8")
      .update(rawBody)
      .digest("base64");
    assert.equal(verifyCashfreeWebhookSignature({ rawBody, timestamp, signature }), true);
    assert.equal(verifyCashfreeWebhookSignature({
      rawBody: Buffer.from(`${rawBody.toString()} `),
      timestamp,
      signature,
    }), false);
  });
});
