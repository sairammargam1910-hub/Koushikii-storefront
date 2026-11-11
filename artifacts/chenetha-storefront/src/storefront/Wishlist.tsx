import { useState } from "react";
import {
  Shell,
  PageHero,
  products,
  ProductCard,
  Empty,
  base,
} from "./_shared";
import { useShopperPreferences } from "./ShopperPreferences";
import { ShopifyProductCard, useShopifyCatalog } from "./ShopifyCatalog";

export function Wishlist() {
  const { wishlist, saveWishlist, loading, error, retry } =
    useShopperPreferences();
  const [feedback, setFeedback] = useState("");
  const shopifyIds = wishlist
    .map((item) => item.id)
    .filter((id) => id.startsWith("gid://shopify/Product/"));
  const catalog = useShopifyCatalog(shopifyIds.length > 0);
  const sampleList = products.filter((product) =>
    wishlist.some((item) => item.id === product.id),
  );
  const shopifyList = catalog.data?.products.filter((product) =>
    shopifyIds.includes(product.id),
  ) ?? [];
  const knownIds = new Set([
    ...sampleList.map((product) => product.id),
    ...shopifyList.map((product) => product.id),
  ]);
  const unavailableCount = wishlist.filter((item) => !knownIds.has(item.id)).length;
  const savedCount = wishlist.length;

  return (
    <Shell>
      <PageHero
        eyebrow="Kept for later"
        title="Your saved pieces."
        subtitle="A small collection of things that caught your eye."
      />
      <main className="wrap content">
        {loading ? (
          <p className="notice" role="status">Loading your saved pieces…</p>
        ) : error ? (
          <div className="notice" role="alert">
            <p>Your saved pieces could not be loaded.</p>
            <button className="btn small outline" onClick={() => void retry()}>
              Try again
            </button>
          </div>
        ) : savedCount ? (
          <>
            {feedback && <p className="notice" role="alert">{feedback}</p>}
            {shopifyIds.length > 0 && catalog.isLoading && (
               <p className="notice" role="status">Loading your saved pieces…</p>
            )}
            {shopifyIds.length > 0 && catalog.isError && (
              <div className="notice" role="alert">
                 <p>Your saved pieces could not be loaded just now. Your wishlist is still saved.</p>
                <button className="btn small outline" onClick={() => void catalog.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {unavailableCount > 0 && !catalog.isLoading && (
              <p className="notice" role="status">
                {unavailableCount} saved {unavailableCount === 1 ? "piece is" : "pieces are"} no longer listed in the current catalog.
              </p>
            )}
            <div className="row" style={{ marginBottom: 25 }}>
              <span className="muted">{savedCount} saved pieces</span>
              <button
                className="link"
                onClick={() => {
                  setFeedback("");
                  void saveWishlist([])
                    .catch(() =>
                      setFeedback("Your saved pieces could not be cleared. Please try again."),
                    );
                }}
              >
                Clear saved pieces
              </button>
            </div>
            {(sampleList.length > 0 || shopifyList.length > 0) && (
              <div className="products">
                {sampleList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
                {shopifyList.map((product) => (
                  <ShopifyProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </>
        ) : (
          <Empty
            title="Nothing saved, for now."
            copy="When a piece stays with you, save it here for another look."
            cta="Find a piece"
            href={base + "Collections"}
          />
        )}
      </main>
    </Shell>
  );
}
