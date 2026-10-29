import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductForm } from "../../src/admin/Admin";
import type { ShopifyAdminProduct } from "@workspace/api-client-react";

const product: ShopifyAdminProduct = {
  id: "gid://shopify/Product/browser-fixture",
  title: "Fixture silk saree",
  handle: "fixture-silk-saree",
  description: "Existing details",
  productType: "Saree",
  status: "ACTIVE",
  tags: ["silk"],
  imageUrl: "https://cdn.example.test/existing-cover.jpg",
  variants: [{
    id: "gid://shopify/ProductVariant/browser-fixture",
    title: "Default",
    price: "1250.00",
    inventoryQuantity: 3,
    inventoryTracked: true,
    inventoryPolicy: "DENY",
    selectedOptions: [{ name: "Title", value: "Default" }],
    inventoryLevels: [],
  }],
};

function Fixture() {
  const [closed, setClosed] = useState(false);
  const editing = new URLSearchParams(window.location.search).get("edit") === "1";
  return <main className="merchant-app">
    {closed
      ? <p data-testid="fixture-closed">Product form closed</p>
      : <ProductForm
          product={editing ? product : undefined}
          currencyCode="INR"
          onClose={() => setClosed(true)}
        />}
  </main>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Fixture />
  </QueryClientProvider>,
);
