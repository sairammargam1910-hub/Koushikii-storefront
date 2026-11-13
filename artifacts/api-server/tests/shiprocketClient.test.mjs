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

function mockShiprocketFetch(calls, { surfaceCouriers = [
  { courier_company_id: 44, courier_name: "Surface Economy", rate: 116.72 },
] } = {}) {
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
      const surfaceOnly = target.searchParams.get("mode") === "Surface";
      return new Response(JSON.stringify({
        currency: "INR",
        data: {
          available_courier_companies: surfaceOnly
            ? surfaceCouriers
            : [
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

async function withAwbResponse(payload, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/login")) {
      return Response.json({ token: "test-token" });
    }
    calls.push({ path: target.pathname, method: init.method, body: JSON.parse(init.body) });
    return Response.json(payload);
  };
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
    }, () => run(loadModule(), calls));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("AWB assignment saves confirmed courier and tracking details using one request", async () => {
  await withAwbResponse({
    awb_assign_status: 1,
    response: { data: {
      awb_code: "AWB-12345",
      courier_company_id: 44,
      courier_name: "Delhivery Surface 2 Kgs",
      tracking_url: "https://shiprocket.co/tracking/AWB-12345",
    } },
  }, async ({ bookShiprocketPackage }, calls) => {
    const result = await bookShiprocketPackage({ shipmentId: "789", courierId: "44", international: false });
    assert.deepEqual(result, {
      awbCode: "AWB-12345",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      trackingUrl: "https://shiprocket.co/tracking/AWB-12345",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/v1/external/courier/assign/awb");
    assert.deepEqual(calls[0].body, { shipment_id: 789, courier_id: 44 });
  });
});

test("creates one Shiprocket order with every cart item, combined value, and combined weight", async () => {
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
      const { createShiprocketPackage } = loadModule();
      const result = await createShiprocketPackage({
        ...baseInput,
        sellingPrice: "480.00",
        weightKg: 3,
        orderItems: [
          { name: "Cotton saree - Default", sku: "COTTON-1", units: 2, sellingPrice: "150.00" },
          { name: "Silk saree - Maroon", sku: "SILK-2", units: 1, sellingPrice: "180.00" },
        ],
      });
      assert.deepEqual(result, { orderId: "456", shipmentId: "789" });
      const createCall = calls.find((call) => call.url.pathname.endsWith("/orders/create/adhoc"));
      assert.ok(createCall);
      assert.deepEqual(createCall.body.order_items, [
        { name: "Cotton saree - Default", sku: "COTTON-1", units: 2, selling_price: 150 },
        { name: "Silk saree - Maroon", sku: "SILK-2", units: 1, selling_price: 180 },
      ]);
      assert.equal(createCall.body.sub_total, 480);
      assert.equal(createCall.body.weight, 3);
      assert.equal("mode" in createCall.body, false, "shipping mode is not sent as an unsupported order field");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("finds a cloned Shiprocket order by exact channel reference with a read-only request", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    calls.push({ path: target.pathname, method: init.method ?? "GET", query: target.searchParams });
    if (target.pathname.endsWith("/auth/login")) {
      return Response.json({ token: "test-token" });
    }
    return Response.json({
      data: {
        data: [
          {
            id: 1716900471,
            channel_order_id: "cfq_55703e06d3ee4522b6fe93799f5d08d5_p0",
            shipments: [{ id: 1712529624 }],
            customer_name: "Do not return customer details",
          },
          {
            id: 1717000001,
            channel_order_id: "cfq_55703e06d3ee4522b6fe93799f5d08d5_p0-C",
            shipments: [{ id: 1712629624 }],
            customer_name: "Do not return customer details",
          },
        ],
      },
    });
  };
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
    }, async () => {
      const { findShiprocketOrdersByReference } = loadModule();
      const result = await findShiprocketOrdersByReference(
        "cfq_55703e06d3ee4522b6fe93799f5d08d5_p0-C",
      );
      assert.deepEqual(result, [{
        shiprocketOrderId: "1717000001",
        orderReference: "cfq_55703e06d3ee4522b6fe93799f5d08d5_p0-C",
        shipmentIds: ["1712629624"],
      }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const ordersRequest = calls.find((call) => call.path.endsWith("/orders"));
  assert.ok(ordersRequest);
  assert.equal(ordersRequest.method, "GET");
  assert.equal(ordersRequest.query.get("filter_by"), "channel_order_id");
  assert.equal(
    ordersRequest.query.get("filter"),
    "cfq_55703e06d3ee4522b6fe93799f5d08d5_p0-C",
  );
  assert.equal(ordersRequest.query.get("per_page"), "10");
});

test("HTTP 200 AWB rejection retains sanitized courier remarks and is never retried", async () => {
  await withAwbResponse({
    awb_assign_status: 0,
    response: { data: {
      error: true,
      success: false,
      rmk: "Courier rejected assignment",
      packages: [{ remarks: ["Validation failed; email buyer@example.com; phone +91 98765 43210; address: 42 Test Street; token=test-private-token"] }],
    } },
  }, async ({ bookShiprocketPackage }, calls) => {
    await assert.rejects(
      bookShiprocketPackage({ shipmentId: "789", courierId: "44", international: false }),
      (error) => {
        assert.equal(error.diagnostics.httpStatus, 200);
        assert.equal(error.diagnostics.errorCode, "AWB_ASSIGNMENT_REJECTED");
        assert.equal(error.diagnostics.bookingRejected, true);
        assert.match(error.diagnostics.message, /Courier rejected assignment/);
        assert.match(error.diagnostics.message, /Validation failed/);
        assert.doesNotMatch(error.diagnostics.message, /buyer@example|98765|Test Street|test-private-token/);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });
});

test("a missing AWB without explicit rejection remains ambiguous", async () => {
  await withAwbResponse({ response: { data: {} } }, async ({ bookShiprocketPackage }, calls) => {
    await assert.rejects(
      bookShiprocketPackage({ shipmentId: "789", courierId: "44", international: false }),
      (error) => {
        assert.equal(error.diagnostics.errorCode, "AWB_CONFIRMATION_MISSING");
        assert.notEqual(error.diagnostics.bookingRejected, true);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });
});

test("an AWB accompanied by conflicting failure flags requires reconciliation", async () => {
  await withAwbResponse({
    awb_assign_status: 0,
    response: { data: { error: true, awb_code: "AWB-12345" } },
  }, async ({ bookShiprocketPackage }, calls) => {
    await assert.rejects(
      bookShiprocketPackage({ shipmentId: "789", courierId: "44", international: false }),
      (error) => {
        assert.equal(error.diagnostics.errorCode, "AWB_CONFIRMATION_MISSING");
        assert.notEqual(error.diagnostics.bookingRejected, true);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });
});

test("domestic rate lookup never creates a provider order or AWB", async () => {
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
      const { quoteShiprocketPackage } = loadModule();
      const result = await quoteShiprocketPackage(baseInput);
      assert.equal(result.amount, "225.50");
      assert.equal(result.courierName, "Economy");
      assert.equal(calls.some((call) => call.url.pathname.includes("/orders/create/")), false);
      assert.equal(result.orderId, undefined);
      assert.equal(result.shipmentId, undefined);
      const quote = calls.find((call) => call.url.pathname.endsWith("/courier/serviceability/"));
      assert.equal(quote.url.searchParams.get("pickup_postcode"), "500007");
      assert.equal(quote.url.searchParams.get("delivery_postcode"), "500008");
      assert.equal(quote.url.searchParams.has("order_id"), false);
      assert.equal(quote.url.searchParams.get("weight"), "1");
      assert.equal(quote.url.searchParams.has("mode"), false);
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Surface-only quote requests Surface serviceability and selects only that response", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls, {
    surfaceCouriers: [
      { courier_company_id: 44, courier_name: "Surface Economy", rate: 116.72 },
    ],
  });
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
    }, async () => {
      const { quoteShiprocketPackage } = loadModule();
      const result = await quoteShiprocketPackage({ ...baseInput, mode: "Surface" });
      const quote = calls.find((call) => call.url.pathname.endsWith("/courier/serviceability/"));

      assert.equal(quote.url.searchParams.get("mode"), "Surface");
      assert.equal(result.courierId, "44");
      assert.equal(result.courierName, "Surface Economy");
      assert.equal(result.amount, "116.72");
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Surface-only quote fails clearly when Shiprocket returns no Surface courier", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockShiprocketFetch(calls, { surfaceCouriers: [] });
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
      SHIPROCKET_PICKUP_POSTCODE: "500007",
    }, async () => {
      const { quoteShiprocketPackage } = loadModule();
      await assert.rejects(
        quoteShiprocketPackage({ ...baseInput, mode: "Surface" }),
        /no serviceable Surface courier.*cannot fall back to Air/i,
      );
      const quote = calls.find((call) => call.url.pathname.endsWith("/courier/serviceability/"));
      assert.equal(quote.url.searchParams.get("mode"), "Surface");
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
      const { quoteShiprocketPackage } = loadModule();
      const result = await quoteShiprocketPackage({
        ...baseInput,
        hsnCode: "5007",
        destination: { ...baseInput.destination, countryCode: "US", countryName: "United States" },
      });
      assert.equal(result.currencyCode, "INR");
      assert.equal(calls.some((call) => call.url.pathname.includes("/orders/create/")), false);
      const quote = calls.find((call) => call.url.pathname.endsWith("/international/courier/serviceability"));
      assert.equal(quote.url.searchParams.get("delivery_country"), "US");
      assert.equal(quote.url.searchParams.has("order_id"), false);
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
      const { quoteShiprocketPackage } = loadModule();
      await assert.rejects(
        quoteShiprocketPackage({
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
      const { quoteShiprocketPackage } = loadModule();
      await assert.rejects(
        quoteShiprocketPackage({
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

test("captures sanitized provider diagnostics for quote failures", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const mockedFetch = mockShiprocketFetch(calls);
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/courier/serviceability/")) {
      calls.push({ url: target, method: init.method ?? "GET", body: undefined });
      return new Response(JSON.stringify({
        error_code: "INVALID_DESTINATION",
        message: "Quote rejected for postcode 505001; phone +91 98765 43210; email buyer@example.com; address: 42 Test Street; Authorization: Bearer test-private-token",
      }), { status: 400 });
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
      const { quoteShiprocketPackage, ShiprocketError } = loadModule();
      await assert.rejects(quoteShiprocketPackage(baseInput), (error) => {
        assert.ok(error instanceof ShiprocketError);
        assert.equal(error.message, "Shiprocket request failed (400).");
        assert.equal(error.diagnostics.endpoint, "/courier/serviceability/");
        assert.equal(error.diagnostics.httpStatus, 400);
        assert.equal(error.diagnostics.errorCode, "INVALID_DESTINATION");
        assert.match(error.diagnostics.message, /Quote rejected/);
        assert.doesNotMatch(
          error.diagnostics.message,
          /505001|98765|buyer@example|Test Street|test-private-token/,
        );
        return true;
      });
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
      const { quoteShiprocketPackage } = loadModule();
      await assert.rejects(quoteShiprocketPackage(baseInput), /no serviceable courier/i);
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
          shipment_track: [{ awb_code: "9876543210", current_status: "In Transit", courier_name: "Test Courier", courier_company_id: 33 }],
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
      assert.equal(result.courierId, "33");
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

test("reads existing Shiprocket shipment assignment details without changing shipment state", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    calls.push({ url: target, method: init.method ?? "GET" });
    if (target.pathname.endsWith("/auth/login")) {
      return new Response(JSON.stringify({ token: "test-token" }), { status: 200 });
    }
    if (target.pathname.endsWith("/shipments/1712529624")) {
      return new Response(JSON.stringify({
        data: {
          order_id: 1716900471,
          shipment_id: 1712529624,
          awb: null,
          courier_id: "",
          status: 11,
          tracking_url: null,
        },
      }), { status: 200 });
    }
    throw new Error(`Unexpected shipment request: ${target.pathname}`);
  };
  try {
    await withEnvironment({
      SHIPROCKET_API_USER_EMAIL: "merchant@example.com",
      SHIPROCKET_API_USER_PASSWORD: "test-password",
    }, async () => {
      const { getShiprocketShipmentDetails } = loadModule();
      const result = await getShiprocketShipmentDetails("1712529624");
      assert.deepEqual(result, {
        orderId: "1716900471",
        shipmentId: "1712529624",
        awbCode: null,
        courierId: null,
        courierName: null,
        trackingUrl: null,
        status: "11",
      });
      assert.equal(calls.find((call) => call.url.pathname.endsWith("/shipments/1712529624")).method, "GET");
      assert.equal(calls.some((call) => call.url.pathname.includes("/assign/awb")), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a provider tracking response for a different AWB", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/login")) {
      return new Response(JSON.stringify({ token: "test-token" }), { status: 200 });
    }
    if (target.pathname.endsWith("/courier/track/awb/9876543210")) {
      return new Response(JSON.stringify({
        tracking_data: {
          shipment_track: [{ awb_code: "99998888777766", current_status: "Delivered" }],
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
      await assert.rejects(getShiprocketTracking("9876543210"), /different AWB/i);
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

test("tracking webhook parser captures shipment references, status code, courier, and activity", () => {
  const { parseShiprocketTrackingWebhook } = loadModule();
  const result = parseShiprocketTrackingWebhook({
    tracking_data: {
      awb: "19041424751540",
      order_id: 456,
      shipment_id: 789,
      courier_name: "Delhivery Surface",
      courier_company_id: 44,
      current_status: "In Transit",
      status_id: 5,
      shipment_track_activities: [{
        activity: "Arrived at the regional hub",
        date: "2026-11-09 10:00:00",
        location: "Vijayawada",
        "sr-status-label": "In Transit",
        "sr-status": "IT",
      }],
    },
  });

  assert.equal(result.awbCode, "19041424751540");
  assert.equal(result.shipmentId, "789");
  assert.equal(result.orderId, "456");
  assert.equal(result.tracking.courierName, "Delhivery Surface");
  assert.equal(result.tracking.courierId, "44");
  assert.equal(result.tracking.status, "In Transit");
  assert.equal(result.tracking.statusCode, "5");
  assert.equal(result.tracking.events[0].description, "Arrived at the regional hub");
  assert.equal(result.tracking.events[0].statusCode, "IT");
});

test("tracking webhook parser accepts Shiprocket's downloaded scans payload", () => {
  const { parseShiprocketTrackingWebhook } = loadModule();
  const result = parseShiprocketTrackingWebhook({
    awb: 59629792084,
    current_status: "Delivered",
    order_id: "13905312",
    current_timestamp: "2021-07-02 16:41:59",
    etd: "2021-07-02 16:41:59",
    current_status_id: 7,
    shipment_status: "Delivered",
    shipment_status_id: 7,
    channel_order_id: "enter your channel order id",
    channel: "enter your channel name",
    courier_name: "Sample courier",
    courier_company_id: 33,
    scans: [
      {
        date: "2019-06-25 12:08:00",
        activity: "SHIPMENT DELIVERED",
        location: "PATIALA",
      },
      {
        date: "2019-06-25 12:06:00",
        activity: "NECESSARY CHARGES PENDING FROM CONSIGNEE",
        location: "PATIALA",
      },
    ],
  });

  assert.equal(result.awbCode, "59629792084");
  assert.equal(result.orderId, "13905312");
  assert.equal(result.tracking.status, "Delivered");
  assert.equal(result.tracking.statusCode, "7");
  assert.equal(result.tracking.courierName, "Sample courier");
  assert.equal(result.tracking.courierId, "33");
  assert.deepEqual(result.tracking.events.map((event) => event.description), [
    "NECESSARY CHARGES PENDING FROM CONSIGNEE",
    "SHIPMENT DELIVERED",
    "Delivered",
  ]);
});

test("tracking snapshots retain distinct history and keep status from an older provider snapshot", () => {
  const { mergeShiprocketTrackingSnapshot } = loadModule();
  const newest = {
    occurredAt: "2026-11-08T12:00:00.000Z",
    status: "Out for Delivery",
    description: "Shipment out for delivery",
    location: "Hyderabad",
  };
  const older = {
    occurredAt: "2026-11-08T10:00:00.000Z",
    status: "In Transit",
    description: "Arrived at the regional hub",
    location: "Vijayawada",
  };
  const incoming = {
    status: "In Transit",
    statusCode: "5",
    awbCode: "19041424751540",
    courierName: "Delhivery Surface",
    trackingUrl: null,
    estimatedDeliveryAt: null,
    events: [older, { ...older }],
  };

  const result = mergeShiprocketTrackingSnapshot({
    status: "Out for Delivery",
    events: [newest],
  }, incoming);

  assert.equal(result.status, "Out for Delivery");
  assert.deepEqual(result.events, [older, newest]);
});

test("tracking snapshots accept a newer status and deduplicate its event", () => {
  const { mergeShiprocketTrackingSnapshot } = loadModule();
  const delivered = {
    occurredAt: "2026-11-08T13:00:00.000Z",
    status: "Delivered",
    description: "Delivered to recipient",
    location: "Hyderabad",
  };
  const current = {
    status: "Out for Delivery",
    events: [{
      occurredAt: "2026-11-08T12:00:00.000Z",
      status: "Out for Delivery",
      description: "Shipment out for delivery",
      location: "Hyderabad",
    }],
  };
  const incoming = {
    status: "Delivered",
    statusCode: "7",
    awbCode: "19041424751540",
    courierName: "Delhivery Surface",
    trackingUrl: null,
    estimatedDeliveryAt: null,
    events: [delivered, { ...delivered }],
  };

  const result = mergeShiprocketTrackingSnapshot(current, incoming);
  assert.equal(result.status, "Delivered");
  assert.deepEqual(result.events.map((event) => event.description), [
    "Shipment out for delivery",
    "Delivered to recipient",
  ]);
});
