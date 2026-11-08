import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../src/lib/shiprocketClient.ts", import.meta.url).pathname],
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

function mockShiprocketFetch(calls) {
  return async (url, init = {}) => {
    const target = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: target, method: init.method ?? "GET", body });
    if (target.pathname.endsWith("/auth/login")) {
      return new Response(JSON.stringify({ token: "test-token" }), { status: 200 });
    }
    if (target.pathname.endsWith("/settings/company/pickup")) {
      return new Response(JSON.stringify({
        data: {
          shipping_address: [{ id: 123, pickup_location: "Primary", pin_code: "500007" }],
        },
      }), { status: 200 });
    }
    if (target.pathname.endsWith("/international/orders/create/adhoc") ||
        target.pathname.endsWith("/orders/create/adhoc")) {
      return new Response(JSON.stringify({ order_id: 456, shipment_id: 789 }), { status: 200 });
    }
    if (target.pathname.includes("/courier/serviceability")) {
      return new Response(JSON.stringify({
        currency: "INR",
        data: {
          available_courier_companies: [
            { courier_company_id: 20, courier_name: "Higher", rate: 325 },
            { courier_company_id: 10, courier_name: "Economy", rate: 225.5 },
          ],
        },
      }), { status: 200 });
    }
    throw new Error(`Unexpected Shiprocket request: ${target.pathname}`);
  };
}

const baseInput = {
  orderId: "quote-package-1",
  packageIndex: 0,
  destination: {
    recipient: "Asha Rao",
    street: "12 Example Road",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500008",
    countryCode: "IN",
    countryName: "India",
  },
  email: "buyer@example.com",
  phone: "+919876543210",
  productName: "Handwoven saree",
  sku: "SAREE-1",
  sellingPrice: "2500.00",
  currencyCode: "INR",
  weightKg: 1,
  lengthCm: 35,
  breadthCm: 25,
  heightCm: 8,
};

test("creates one domestic quote order using the confirmed pickup and parcel values", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls);
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
      SHIPROCKET_REASON_OF_EXPORT: null,
      SHIPROCKET_TERMS_OF_INVOICE: null,
    }, async () => {
      const { createAndQuotePackage } = loadModule();
      const result = await createAndQuotePackage(baseInput);
      assert.equal(result.amount, "225.50");
      assert.equal(result.courierName, "Economy");
      const create = calls.find((call) => call.url.pathname.endsWith("/orders/create/adhoc"));
      assert.equal(create.body.order_id, "quote-package-1");
      assert.equal(create.body.weight, 1);
      assert.equal(create.body.length, 35);
      assert.equal(create.body.breadth, 25);
      assert.equal(create.body.height, 8);
      const quote = calls.find((call) => call.url.pathname.endsWith("/courier/serviceability/"));
      assert.equal(quote.url.searchParams.get("pickup_postcode"), "500007");
      assert.equal(quote.url.searchParams.get("delivery_postcode"), "500008");
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("international quote uses export settings and the selected destination country", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls);
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
      SHIPROCKET_REASON_OF_EXPORT: "3",
      SHIPROCKET_TERMS_OF_INVOICE: "FOB",
    }, async () => {
      const { createAndQuotePackage } = loadModule();
      const result = await createAndQuotePackage({
        ...baseInput,
        hsnCode: "5007",
        destination: { ...baseInput.destination, countryCode: "US", countryName: "United States" },
      });
      assert.equal(result.currencyCode, "INR");
      const create = calls.find((call) => call.url.pathname.endsWith("/international/orders/create/adhoc"));
      assert.equal(create.body.reasonOfExport, 3);
      assert.equal(create.body.Terms_Of_Invoice, "FOB");
      assert.equal(create.body.order_items[0].hsn, 5007);
      const quote = calls.find((call) => call.url.pathname.endsWith("/international/courier/serviceability"));
      assert.equal(quote.url.searchParams.get("delivery_country"), "US");
      assert.equal(calls.some((call) => call.url.pathname.includes("/international/courier/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("international quote requires an HSN code before creating an order", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls);
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
      SHIPROCKET_REASON_OF_EXPORT: "3",
      SHIPROCKET_TERMS_OF_INVOICE: "FOB",
    }, async () => {
      const { createAndQuotePackage } = loadModule();
      await assert.rejects(
        createAndQuotePackage({
          ...baseInput,
          destination: { ...baseInput.destination, countryCode: "US", countryName: "United States" },
        }),
        /valid Shiprocket HSN code must be configured/,
      );
      assert.equal(calls.some((call) => call.url.pathname.endsWith("/international/orders/create/adhoc")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("international quotes fail closed when export terms are not configured", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls);
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_REASON_OF_EXPORT: null,
      SHIPROCKET_TERMS_OF_INVOICE: null,
    }, async () => {
      const { createAndQuotePackage } = loadModule();
      await assert.rejects(
        createAndQuotePackage({
          ...baseInput,
          hsnCode: "5007",
          destination: { ...baseInput.destination, countryCode: "US", countryName: "United States" },
        }),
        /export purpose must be configured/,
      );
      assert.equal(calls.some((call) => call.url.pathname.endsWith("/international/orders/create/adhoc")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unsupported destination fails clearly without booking a shipment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const mockedFetch = mockShiprocketFetch(calls);
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.pathname.includes("/courier/serviceability")) {
      calls.push({ url: target, method: init.method ?? "GET", body: undefined });
      return new Response(JSON.stringify({ message: "No serviceable couriers available." }), { status: 400 });
    }
    return mockedFetch(url, init);
  };
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
      SHIPROCKET_REASON_OF_EXPORT: null,
      SHIPROCKET_TERMS_OF_INVOICE: null,
    }, async () => {
      const { createAndQuotePackage } = loadModule();
      await assert.rejects(createAndQuotePackage(baseInput), /no serviceable courier/i);
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetches and normalizes Shiprocket tracking by AWB without booking another shipment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    calls.push({ url: target, method: init.method ?? "GET" });
    if (target.pathname.endsWith("/auth/login")) {
      return new Response(JSON.stringify({ token: "test-token" }), { status: 200 });
    }
    if (target.pathname.endsWith("/courier/track/awb/9876543210")) {
      return new Response(JSON.stringify({
        tracking_data: {
          shipment_status: 6,
          track_url: "https://shiprocket.co/tracking/9876543210",
          etd: "2026-11-12",
          shipment_track: [{ awb_code: "9876543210", current_status: "In Transit", courier_name: "Test Courier" }],
          shipment_track_activities: [
            { date: "2026-11-08 12:00:00", activity: "Departed facility", location: "Hyderabad" },
            { date: "2026-11-08 08:00:00", activity: "Picked up", location: "Hyderabad" },
          ],
        },
      }), { status: 200 });
    }
    throw new Error(`Unexpected tracking request: ${target.pathname}`);
  };
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
    }, async () => {
      const { getShiprocketTracking } = loadModule();
      const result = await getShiprocketTracking("9876543210");
      assert.equal(result.status, "In Transit");
      assert.equal(result.statusCode, "6");
      assert.equal(result.awbCode, "9876543210");
      assert.equal(result.courierName, "Test Courier");
      assert.equal(result.trackingUrl, "https://shiprocket.co/tracking/9876543210");
      assert.equal(result.estimatedDeliveryAt, "2026-11-12T00:00:00.000Z");
      assert.deepEqual(result.events.map((event) => event.description), ["Picked up", "Departed facility"]);
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tracking normalization rejects a non-HTTPS provider URL", () => {
  const { normalizeShiprocketTracking } = loadModule();
  const result = normalizeShiprocketTracking({
    tracking_data: {
      track_url: "http://example.invalid/track",
      shipment_track: [{ current_status: "In Transit" }],
    },
  }, "9876543210");
  assert.equal(result.trackingUrl, null);
});
