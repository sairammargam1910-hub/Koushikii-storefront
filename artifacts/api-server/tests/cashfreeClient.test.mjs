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
        isInternational: false,
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

test("captures Cashfree Create Order error details without exposing them in the client error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "request_invalid",
    type: "invalid_request_error",
    message: "The order request was rejected.",
  }), { status: 400 });
  try {
    await withEnvironment({
      CASHFREE_ENVIRONMENT: "sandbox",
      CHECKOUT_LIVE_ENABLED: null,
      CASHFREE_APP_ID: "sandbox-app-id",
      CASHFREE_SECRET_KEY: "sandbox-secret",
    }, async () => {
      const { createCashfreeOrder, CashfreeError } = loadModule();
      await assert.rejects(
        createCashfreeOrder({
          orderId: "chenetha_order123",
          amount: "1234.50",
          currencyCode: "INR",
          email: "buyer@example.com",
          phone: "+919876543210",
          returnUrl: "https://shop.example/Checkout?cashfree_order_id=chenetha_order123",
          expiresAt: "2026-11-07T12:10:00.000Z",
          idempotencyKey: "f991fda7-d46f-4113-a93a-64020aab037a",
          isInternational: false,
        }),
        (error) => {
          assert.ok(error instanceof CashfreeError);
          assert.equal(error.upstreamStatus, 400);
          assert.equal(error.providerCode, "request_invalid");
          assert.equal(error.providerType, "invalid_request_error");
          assert.equal(error.providerMessage, "The order request was rejected.");
          assert.match(error.message, /Your bag has not been charged/);
          assert.doesNotMatch(error.message, /request_invalid|The order request/);
          assert.deepEqual(error.createOrderRequest, {
            orderId: "chenetha_order123",
            orderAmount: 1234.5,
            orderCurrency: "INR",
            orderIdValid: true,
            orderAmountValid: true,
            orderCurrencyValid: true,
            customerIdLength: 17,
            customerIdAlphanumeric: false,
            customerEmailValid: true,
            customerPhoneDigitCount: 12,
            returnUrlLength: 65,
            returnUrlLengthValid: true,
            returnUrlProtocol: "https:",
            returnUrlHost: "shop.example",
            returnUrlPath: "/Checkout",
            returnUrlValid: true,
            idempotencyKeyUuid: true,
          });
          return true;
        },
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production mode fails closed without the explicit live flag and separate credentials", async () => {
  await withEnvironment({
    CASHFREE_ENVIRONMENT: "production",
    CHECKOUT_LIVE_ENABLED: null,
    CASHFREE_INTERNATIONAL_PAYMENTS_CONFIRMED: "true",
    CASHFREE_SUPPORTED_CURRENCIES: "INR",
    CASHFREE_SETTLEMENT_CURRENCY: "INR",
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
        isInternational: false,
      }),
      /Live Cashfree credentials/,
    );
  });
});

test("live checkout requires Cashfree international confirmation and matching currency settlement", async () => {
  await withEnvironment({
    CASHFREE_ENVIRONMENT: "production",
    CHECKOUT_LIVE_ENABLED: "true",
    CASHFREE_INTERNATIONAL_PAYMENTS_CONFIRMED: null,
    CASHFREE_SUPPORTED_CURRENCIES: "INR, USD",
    CASHFREE_SETTLEMENT_CURRENCY: "INR",
  }, async () => {
    const { assertCashfreeLiveReadiness } = loadModule();
    assert.throws(
      () => assertCashfreeLiveReadiness("INR", true),
      /confirms international payments/,
    );

    process.env.CASHFREE_INTERNATIONAL_PAYMENTS_CONFIRMED = "true";
    assert.throws(
      () => assertCashfreeLiveReadiness("USD", true),
      /does not match the confirmed INR settlement currency/,
    );
    assert.throws(
      () => assertCashfreeLiveReadiness("EUR", false),
      /has not confirmed support for EUR/,
    );
    assert.doesNotThrow(() => assertCashfreeLiveReadiness("INR", true));
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
