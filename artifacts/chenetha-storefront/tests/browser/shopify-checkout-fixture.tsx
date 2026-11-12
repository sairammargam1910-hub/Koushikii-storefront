import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Router as WouterRouter, useLocation } from "wouter";
import { Truck } from "lucide-react";
import { ScrollRestoration } from "../../src/storefront/RouteEffects";
import { ShopperPreferencesProvider } from "../../src/storefront/ShopperPreferences";
import { Collections } from "../../src/storefront/Collections";
import { Home } from "../../src/storefront/Home";
import { ShopifyProductRoute } from "../../src/storefront/ShopifyCatalog";
import { Cart } from "../../src/storefront/Cart";
import { Checkout } from "../../src/storefront/Checkout";
import { Confirmation } from "../../src/storefront/Confirmation";
import { ShipmentTrackingProgress } from "../../src/storefront/ShipmentTrackingProgress";
import type { ShopifyOrderTrackingShipment } from "@workspace/api-client-react";
import "../../src/index.css";
import "../../src/storefront/_orders.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPublishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function Fixture() {
  const [location] = useLocation();
  const screen = new URLSearchParams(window.location.search).get("screen")
    ?? (location.toLowerCase() === "/cart" ? "cart" : null);
  if (screen === "shipment-progress") {
    const paymentConfirmed = new URLSearchParams(window.location.search).get("paid") !== "0";
    const shipment: ShopifyOrderTrackingShipment = {
      status: "In Transit",
      shipmentStatus: "in_transit",
      statusCode: "6",
      awbCode: "CHN-5482-9137",
      courierName: "Delhivery Surface 2 Kgs",
      trackingUrl: "https://tracking.example.test/CHN-5482-9137",
      estimatedDeliveryAt: "2026-11-13T00:00:00.000Z",
      events: [
        { status: "IN TRANSIT", description: "In Transit", occurredAt: "2026-11-13T04:39:00.000Z", location: "HYD/PC1, Hyderabad, Telangana" },
        { status: "PICKED UP", description: "Pickup Done", occurredAt: "2026-11-12T18:36:00.000Z", location: "PCK/SEC, Hyderabad, Telangana" },
        { status: "OUT FOR PICKUP", description: "Out For Pickup", occurredAt: "2026-11-12T15:28:00.000Z", location: "PCK/SEC, Hyderabad, Telangana" },
        { status: "DATA RECEIVED", description: "Shipment information received", occurredAt: "2026-11-11T21:27:00.000Z", location: "PCK/SEC, Hyderabad, Telangana" },
      ],
    };
    return <main className="wrap content order-detail-page">
      <section className="detail-panel shipment-panel" aria-labelledby="shipment-title">
        <div className="detail-panel-heading">
          <span className="detail-icon"><Truck size={19}/></span>
          <div><span className="eyebrow">The journey</span><h3 id="shipment-title">Delivery progress</h3></div>
        </div>
        <ShipmentTrackingProgress shipment={shipment} index={0} paymentConfirmed={paymentConfirmed}/>
      </section>
    </main>;
  }
  if (location.toLowerCase() === "/collections") return <Collections />;
  if (location.toLowerCase() === "/") return <Home />;
  if (location.toLowerCase() === "/product") {
    const handle = new URLSearchParams(window.location.search).get("product") || "fixture-saree";
    return <ShopifyProductRoute handle={handle} />;
  }
  if (screen === "home") return <Home />;
  if (screen === "collections") return <Collections />;
  if (screen === "product") return <ShopifyProductRoute handle="fixture-saree" />;
  if (screen === "cart") return <Cart />;
  if (screen === "checkout") return <Checkout />;
  if (location.toLowerCase() === "/confirmation") return <Confirmation />;
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <WouterRouter base={basePath}>
      <ScrollRestoration />
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
      >
        <ShopperPreferencesProvider>
          <Fixture />
        </ShopperPreferencesProvider>
      </ClerkProvider>
    </WouterRouter>
  </QueryClientProvider>,
);
