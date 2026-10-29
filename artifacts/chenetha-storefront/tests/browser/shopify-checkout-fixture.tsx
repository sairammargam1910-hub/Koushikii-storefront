import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Router as WouterRouter } from "wouter";
import { ShopifyProductRoute } from "../../src/storefront/ShopifyCatalog";
import { Cart } from "../../src/storefront/Cart";
import { Checkout } from "../../src/storefront/Checkout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPublishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function Fixture() {
  const screen = new URLSearchParams(window.location.search).get("screen");
  if (screen === "product") return <ShopifyProductRoute handle="fixture-saree" />;
  if (screen === "cart") return <Cart />;
  if (screen === "checkout") return <Checkout />;
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <WouterRouter base={basePath}>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
      >
        <Fixture />
      </ClerkProvider>
    </WouterRouter>
  </QueryClientProvider>,
);
