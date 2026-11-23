import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductForm } from "../../src/admin/Admin";
import type { ShopifyAdminProduct, ShopifyOrderSummary, SiteContentItem } from "@workspace/api-client-react";
import { ShopifyProductRoute } from "../../src/storefront/ShopifyCatalog";
import { Cart } from "../../src/storefront/Cart";
import { Checkout } from "../../src/storefront/Checkout";
import { ContentEditor } from "../../src/admin/ContentAdmin";
import { PublishedHero } from "../../src/storefront/Home";
import { OrdersPageContent } from "../../src/storefront/Orders";

const orderSummary = (orderRef: string, name: string): ShopifyOrderSummary => ({
  orderRef,
  name,
  createdAt: "2026-11-18T12:00:00.000Z",
  processedAt: null,
  financialStatus: "PAID",
  fulfillmentStatus: "IN_TRANSIT",
  totalAmount: "18400.00",
  currencyCode: "INR",
  lineItems: [
    {
      id: `${orderRef}-line-1`,
      title: "Narayanpet Cotton Saree",
      variantTitle: "Maroon / 6.2 m",
      sku: "NAR-MAR-01",
      quantity: 1,
      unitPrice: "14500.00",
      totalPrice: "14500.00",
      currencyCode: "INR",
      image: { url: "/tests/browser/media/hero-portrait.svg", altText: "Maroon handloom saree" },
    },
    {
      id: `${orderRef}-line-2`,
      title: "Handwoven stole",
      variantTitle: null,
      sku: "STL-01",
      quantity: 2,
      unitPrice: "1950.00",
      totalPrice: "3900.00",
      currencyCode: "INR",
      image: null,
    },
  ],
});

function OrdersFixture() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state") || "orders";
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [retryCount, setRetryCount] = useState(0);
  const isLoaded = state !== "not-loaded";
  const isSignedIn = state !== "signed-out";
  const response = state === "orders"
    ? {
        orders: [pageCursors.length === 1 ? orderSummary("fixture-order-1001", "#1001") : orderSummary("fixture-order-0998", "#0998")],
        nextCursor: pageCursors.length === 1 ? "older-page-cursor" : null,
      }
    : { orders: [], nextCursor: null };

  return <div className="kq">
    <OrdersPageContent
      isLoaded={isLoaded}
      isSignedIn={isSignedIn}
      signInHref="/sign-in?redirect_url=%2FOrders%3Ffrom%3Dfixture"
      pageCursors={pageCursors}
      setPageCursors={setPageCursors}
      response={response}
      isLoading={state === "loading"}
      isError={state === "error"}
      isFetching={false}
      refetch={() => setRetryCount((count) => count + 1)}
    />
    <output data-testid="fixture-retry-count" hidden>{retryCount}</output>
  </div>;
}

const product: ShopifyAdminProduct = {
  id: "gid://shopify/Product/browser-fixture",
  title: "Fixture silk saree",
  handle: "fixture-silk-saree",
  description: "Existing details",
  productType: "Saree",
  status: "ACTIVE",
  tags: ["silk"],
  fabric: "Silk",
  craftTechnique: "",
  region: "",
  colour: "",
  collectionIds: [],
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

const heroItem = (orientation: string, focalPointX: number | null = null, focalPointY: number | null = null, id = "00000000-0000-4000-8000-000000000130"): SiteContentItem => ({
  id,
  kind: "hero_slide",
  placement: null,
  title: "Focal point browser fixture",
  eyebrow: "A saved hero image",
  body: "Test copy",
  imageUrl: `/tests/browser/media/hero-${orientation}.svg`,
  mobileImageUrl: null,
  imageFit: "cover",
  desktopImageAspectRatio: "4:3",
  mobileImageAspectRatio: "5:4",
  mediaUrl: null,
  altText: "Test hero image",
  focalPointX,
  focalPointY,
  ctaLabel: "Explore",
  ctaUrl: "/Collections",
  linkedProductId: null,
  sortOrder: 0,
  published: true,
  approved: false,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
});
const existingHomeImage: SiteContentItem = {
  id: "existing-cotton-home-image",
  kind: "home_image",
  placement: "fabric_tile",
  title: "Cotton",
  eyebrow: null,
  body: null,
  imageUrl: "https://cdn.example.test/cotton-tile.webp",
  mobileImageUrl: null,
  imageFit: "cover",
  desktopImageAspectRatio: "4:3",
  mobileImageAspectRatio: "5:4",
  mediaUrl: null,
  altText: "Cotton weave",
  focalPointX: null,
  focalPointY: null,
  ctaLabel: null,
  ctaUrl: null,
  linkedProductId: null,
  sortOrder: 0,
  published: true,
  approved: false,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
};

function HeroEditorFixture({ orientation }: { orientation: string }) {
  const [closed, setClosed] = useState(false);
  const [item] = useState<SiteContentItem>(() => {
    try {
      const saved = window.localStorage.getItem("hero-focal-browser-fixture");
      if (saved) return JSON.parse(saved) as SiteContentItem;
    } catch {}
    return heroItem(orientation);
  });
  return <main className="merchant-app">
    {closed
      ? <p data-testid="hero-editor-closed">Hero editor closed</p>
      : <ContentEditor item={item} kind="hero_slide" onClose={() => setClosed(true)}/>}
  </main>;
}

function HeroPreviewFixture({ orientation, x, y }: { orientation: string; x: number; y: number }) {
  return <div className="kq"><PublishedHero slides={[heroItem(orientation, x, y)]}/></div>;
}

function HeroCarouselFixture() {
  const slides = [
    heroItem("landscape", 12, 28, "00000000-0000-4000-8000-000000000131"),
    heroItem("portrait", 76, 83, "00000000-0000-4000-8000-000000000132"),
  ];
  return <div className="kq"><PublishedHero slides={slides}/></div>;
}

function Fixture() {
  const [closed, setClosed] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const editing = params.get("edit") === "1";
  const screen = params.get("screen");
  if (screen === "orders") return <OrdersFixture/>;
  if (screen === "hero-editor") return <HeroEditorFixture orientation={params.get("orientation") || "landscape"}/>;
  if (screen === "hero-preview") return <HeroPreviewFixture
    orientation={params.get("orientation") || "landscape"}
    x={Number(params.get("x") ?? 50)}
    y={Number(params.get("y") ?? 54)}
  />;
  if (screen === "hero-carousel") return <HeroCarouselFixture/>;
  if (screen === "home-image-editor") return closed
    ? <p data-testid="home-image-editor-closed">Home image editor closed</p>
    : <main className="merchant-app"><ContentEditor kind="home_image" existingItems={params.get("existing") === "1" ? [existingHomeImage] : []} onClose={() => setClosed(true)}/></main>;
  if (screen === "product") return <ShopifyProductRoute handle="fixture-saree" />;
  if (screen === "cart") return <Cart />;
  if (screen === "checkout") return <Checkout />;
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
