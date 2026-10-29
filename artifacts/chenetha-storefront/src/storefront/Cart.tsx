import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, Trash2 } from "lucide-react";
import { updateShopifyCartDiscountCodes, updateShopifyCartLines } from "@workspace/api-client-react";
import {
  Shell,
  PageHero,
  useStore,
  products,
  format,
  saveItems,
  Qty,
  moneySub,
  Empty,
  base,
} from "./_shared";
import {
  formatShopifyMoney,
  updateShopifyCartCache,
  useShopifyCart,
} from "./ShopifyCatalog";
import {
  clearShopifyCartMeta,
  useShopifyCartMeta,
} from "./shopifyCartState";

export function Cart() {
  const sampleCart = useStore("kq-cart");
  const sampleProducts = products.filter((product) =>
    sampleCart.some((item) => item.id === product.id),
  );
  const meta = useShopifyCartMeta();
  const shopifyCart = useShopifyCart(meta?.id);
  const queryClient = useQueryClient();
  const updateLine = useMutation({
    mutationFn: (data: {
      cartId: string;
      lines: Array<{ id: string; quantity: number }>;
    }) => updateShopifyCartLines(data),
    onSuccess: (updatedCart) => updateShopifyCartCache(queryClient, updatedCart),
  });
  const updateDiscountCodes = useMutation({
    mutationFn: (data: Parameters<typeof updateShopifyCartDiscountCodes>[0]) =>
      updateShopifyCartDiscountCodes(data),
    onSuccess: (updatedCart) => updateShopifyCartCache(queryClient, updatedCart),
  });
  const displayedShopifyQuantity =
    shopifyCart.data?.totalQuantity ?? meta?.totalQuantity ?? 0;

  return (
    <Shell>
      <PageHero
        eyebrow={meta ? `Your bag · Shopify (${displayedShopifyQuantity})` : "Your bag · Sample selection"}
        title="A little goodness, gathered."
        subtitle={
          meta
            ? "Your Shopify products and prices are refreshed from the connected store."
            : "Review your saved pieces. Published Shopify products can be purchased through secure Shopify checkout."
        }
      />
      <main className="wrap content">
        {meta ? (
          <ShopifyBag
            cart={shopifyCart.data}
            isLoading={shopifyCart.isLoading}
            isError={shopifyCart.isError}
            isUpdating={updateLine.isPending}
            updateError={updateLine.error}
            isApplyingDiscount={updateDiscountCodes.isPending}
            discountError={updateDiscountCodes.error}
            onRetry={() => shopifyCart.refetch()}
            onClear={clearShopifyCartMeta}
            onDiscountCodesChange={(cartId, discountCodes) =>
              updateDiscountCodes.mutate({ cartId, discountCodes })
            }
            onQuantityChange={(lineId, quantity) => {
              if (!shopifyCart.data) return;
              updateLine.mutate({
                cartId: shopifyCart.data.id,
                lines: [{ id: lineId, quantity }],
              });
            }}
          />
        ) : sampleCart.length ? (
          <div className="two-col">
            <section>
              <div className="row">
                <span className="eyebrow">Sample selections ({sampleCart.reduce((sum, item) => sum + item.qty, 0)})</span>
                <a className="link" href={base + "Collections"}>Continue exploring</a>
              </div>
              {sampleProducts.map((product) => {
                const row = sampleCart.find((item) => item.id === product.id)!;
                return (
                  <article key={product.id} className="cartrow" data-testid={`row-cart-item-${product.id}`}>
                    <a href={`${base}Product?id=${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`}>
                      <span className={`textile s${products.indexOf(product) % 6 + 1}`} style={{ display: "block", width: 100, height: 125 }} />
                    </a>
                    <div>
                      <a href={`${base}Product?id=${encodeURIComponent(product.id)}`}><h3>{product.name}</h3></a>
                      <p className="muted">{product.type} · {product.weave}</p>
                      <Qty value={row.qty} onChange={(quantity) => saveItems("kq-cart", sampleCart.map((item) => item.id === product.id ? { ...item, qty: quantity } : item))} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b>{format(product.price * row.qty)}</b>
                      <br />
                      <button
                        className="link"
                        style={{ marginTop: 14, border: 0, background: "none" }}
                        type="button"
                        onClick={() => saveItems("kq-cart", sampleCart.filter((item) => item.id !== product.id))}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
            <aside className="panel">
              <span className="eyebrow">Sample catalogue only</span>
              <h3 style={{ margin: "10px 0 22px" }}>These are not Shopify products.</h3>
              <div className="row"><span>Illustrative subtotal</span><b>{format(moneySub(sampleCart))}</b></div>
              <p className="muted">Sample items cannot be purchased. Add a verified, published Shopify product to use Shopify checkout.</p>
              <a className="btn outline" style={{ width: "100%", marginTop: 20 }} href={base + "Checkout"}>Prepare a product enquiry <ArrowRight size={14} /></a>
            </aside>
          </div>
        ) : (
          <div data-testid="empty-cart">
            <Empty title="Your bag is taking a quiet moment." copy="Explore the collection and add an available Shopify saree to your bag." />
          </div>
        )}

        {meta && sampleCart.length > 0 && (
          <section className="panel shopify-sample-selections">
            <span className="eyebrow">Separate sample selections</span>
            <p className="muted">Illustrative sample items are not included in Shopify checkout.</p>
            {sampleProducts.map((product) => {
              const row = sampleCart.find((item) => item.id === product.id)!;
              return (
                <div className="row" key={product.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{product.name} · {row.qty} × {format(product.price)}</span>
                  <button className="link" type="button" onClick={() => saveItems("kq-cart", sampleCart.filter((item) => item.id !== product.id))}>Remove</button>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </Shell>
  );
}

function ShopifyBag({
  cart,
  isLoading,
  isError,
  isUpdating,
  updateError,
  isApplyingDiscount,
  discountError,
  onRetry,
  onClear,
  onQuantityChange,
  onDiscountCodesChange,
}: {
  cart: ReturnType<typeof useShopifyCart>["data"];
  isLoading: boolean;
  isError: boolean;
  isUpdating: boolean;
  updateError: unknown;
  isApplyingDiscount: boolean;
  discountError: unknown;
  onRetry: () => void;
  onClear: () => void;
  onQuantityChange: (lineId: string, quantity: number) => void;
  onDiscountCodesChange: (cartId: string, discountCodes: string[]) => void;
}) {
  const [discountCode, setDiscountCode] = useState("");

  if (isLoading) {
    return <div className="shopify-catalog-status" role="status">Refreshing your Shopify bag…</div>;
  }

  if (isError || !cart) {
    return (
      <div className="panel" role="alert">
        <span className="eyebrow">Shopify bag unavailable</span>
        <p className="muted">Your saved Shopify cart may have expired, or Shopify could not be reached.</p>
        <div className="actions">
          <button className="btn outline" type="button" onClick={onRetry}><RefreshCw size={14} /> Try again</button>
          <button className="link" type="button" onClick={onClear}>Clear this saved bag</button>
        </div>
      </div>
    );
  }

  if (!cart.lines.length) {
    return (
      <div className="empty">
        <span className="eyebrow">Shopify bag</span>
        <h2>Your Shopify bag is empty.</h2>
        <p>Add an available product from the collection to continue.</p>
        <button className="link" type="button" onClick={onClear}>Clear this saved bag</button>
        <a className="btn" href={base + "Collections"}>Browse sarees <ArrowRight size={14} /></a>
      </div>
    );
  }

  const hasUnavailableLine = cart.lines.some((line) => !line.availableForSale || line.isDemo);
  const updateErrorMessage = getCartUpdateErrorMessage(updateError);
  const discountErrorMessage = getCartUpdateErrorMessage(discountError);

  return (
    <div className="two-col">
      <section>
        <div className="row">
          <span className="eyebrow">Shopify products ({cart.totalQuantity})</span>
          <a className="link" href={base + "Collections"}>Continue exploring</a>
        </div>
        {updateErrorMessage && (
          <p className="notice" role="alert">
            Shopify couldn’t update your bag: {updateErrorMessage} Your saved bag is unchanged. Please try again.
          </p>
        )}
        {cart.lines.map((line) => (
          <article className="cartrow shopify-cart-row" key={line.id}>
            <a href={`${base}Product?shopify=${encodeURIComponent(line.productHandle)}`} aria-label={`View ${line.productTitle}`}>
              {line.image ? (
                <img src={line.image.url} alt={line.image.altText || line.productTitle} />
              ) : (
                <span className="shopify-cart-no-image">Photo not available</span>
              )}
            </a>
            <div>
              <a href={`${base}Product?shopify=${encodeURIComponent(line.productHandle)}`}><h3>{line.productTitle}</h3></a>
              <p className="muted">{line.variantTitle}</p>
              {line.isDemo && <span className="pill shopify-demo-badge-inline">Demo only · not for sale</span>}
              <Qty value={line.quantity} onChange={(quantity) => onQuantityChange(line.id, quantity)} />
            </div>
            <div className="shopify-cart-line-total">
              <b>{formatShopifyMoney(String(Number(line.unitPrice) * line.quantity), line.currencyCode)}</b>
              <br />
              <button className="link" type="button" disabled={isUpdating} onClick={() => onQuantityChange(line.id, 0)}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </article>
        ))}
        {isUpdating && <p role="status" className="muted">Updating your Shopify bag…</p>}
      </section>

      <aside className="panel">
        <span className="eyebrow">Shopify order summary</span>
        <h3 style={{ margin: "10px 0 22px" }}>Your selected sarees</h3>
        <div className="row">
          <span>Subtotal</span>
          <b data-testid="text-shopify-cart-subtotal">{formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}</b>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const code = discountCode.trim();
            if (code) onDiscountCodesChange(cart.id, [code]);
          }}
          style={{ display: "grid", gap: 8, marginTop: 20 }}
          aria-label="Apply a discount code"
        >
          <label htmlFor="shopify-discount-code" className="eyebrow">Discount code</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id="shopify-discount-code"
              data-testid="input-shopify-discount-code"
              value={discountCode}
              onChange={(event) => setDiscountCode(event.currentTarget.value)}
              autoComplete="off"
              maxLength={128}
              placeholder="Enter your code"
              style={{ flex: 1, minWidth: 0, padding: "11px 12px", border: "1px solid var(--line)", background: "#fffaf2" }}
            />
            <button
              className="btn small"
              data-testid="button-apply-shopify-discount"
              type="submit"
              disabled={!discountCode.trim() || isApplyingDiscount}
            >
              {isApplyingDiscount ? "Applying…" : "Apply"}
            </button>
          </div>
        </form>
        {discountErrorMessage && (
          <p className="notice" role="alert" data-testid="notice-shopify-discount-error">
            Shopify couldn’t update this code: {discountErrorMessage}
          </p>
        )}
        {cart.discountCodes.map((discount) => (
          <p
            className={discount.applicable ? "muted" : "notice"}
            role={discount.applicable ? "status" : "alert"}
            data-testid={discount.applicable ? "status-shopify-discount" : "notice-shopify-discount"}
            key={discount.code}
          >
            {discount.applicable
              ? `Code ${discount.code} is applied to this Shopify bag.`
              : `Shopify says code ${discount.code} does not apply to this bag.`}
          </p>
        ))}
        {cart.discountCodes.length > 0 && (
          <button
            className="link"
            data-testid="button-remove-shopify-discount"
            type="button"
            disabled={isApplyingDiscount}
            onClick={() => onDiscountCodesChange(cart.id, [])}
          >
            Remove discount code
          </button>
        )}
        <p className="muted">Shopify calculates shipping, taxes, and the final amount at checkout.</p>
        {hasUnavailableLine ? (
          <p className="notice" role="alert">A demo or unavailable listing is in this bag. Remove it or update its Shopify details before checkout.</p>
        ) : (
          <a className="btn" style={{ width: "100%", marginTop: 18 }} href={base + "Checkout"} data-testid="link-shopify-checkout">
            Review and checkout <ArrowRight size={14} />
          </a>
        )}
        <p className="muted" style={{ fontSize: 11 }}>Shipping address and payment are entered on Shopify’s secure checkout.</p>
      </aside>
    </div>
  );
}

function getCartUpdateErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim()
    ? data.error.trim()
    : null;
}
