import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Router as WouterRouter, useLocation } from "wouter";
import { ScrollRestoration } from "../../src/storefront/RouteEffects";
import { ShopperPreferencesProvider } from "../../src/storefront/ShopperPreferences";
import { Collections } from "../../src/storefront/Collections";
import { Home } from "../../src/storefront/Home";
import { ShopifyProductRoute } from "../../src/storefront/ShopifyCatalog";
import { Cart } from "../../src/storefront/Cart";
import { Checkout } from "../../src/storefront/Checkout";
import { Confirmation } from "../../src/storefront/Confirmation";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPublishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function Fixture() {
  const [location] = useLocation();
  const screen = new URLSearchParams(window.location.search).get("screen")
    ?? (location.toLowerCase() === "/cart" ? "cart" : null);
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
