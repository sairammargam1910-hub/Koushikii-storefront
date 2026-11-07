import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import {
  updateShopifyCartDiscountCodes,
  updateShopifyCartLines,
  type ShopifyCartResponse,
} from "@workspace/api-client-react";
import {
  Shell,
  TempleBorder,
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
  isDefaultShopifyVariantTitle,
  updateShopifyCartCache,
  useShopifyCart,
} from "./ShopifyCatalog";
import {
  clearShopifyCartMeta,
  useShopifyCartMeta,
} from "./shopifyCartState";
import "./Cart.css";

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
      <div className="cart-page">
        <header className="cart-hero">
          <div className="wrap">
            <span className="eyebrow" data-testid="text-cart-quantity">
              {meta
                ? `Your bag · ${displayedShopifyQuantity} ${displayedShopifyQuantity === 1 ? "piece" : "pieces"}`
                : "Your bag · Chenetha by Koushikii"}
            </span>
            <h1>Your bag, beautifully considered.</h1>
            <p>
              {meta
                ? "Review your handloom pieces, then enter delivery details on this website."
                : "Review your saved pieces. Published Shopify sarees can be purchased with a current delivery quote and secure Cashfree payment."}
            </p>
          </div>
        </header>
        <TempleBorder />
        <main className="wrap content cart-main">
        {meta ? (
          <ShopifyBag
            cart={shopifyCart.data}
            isLoading={shopifyCart.isLoading}
            isError={shopifyCart.isError}
            loadError={shopifyCart.error}
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
          <div className="cart-layout">
            <section className="cart-items">
              <div className="cart-list-head">
                <span className="eyebrow" data-testid="text-cart-items-count">
                  Sample selections · {sampleCart.reduce((sum, item) => sum + item.qty, 0)}{" "}
                  {sampleCart.reduce((sum, item) => sum + item.qty, 0) === 1 ? "piece" : "pieces"}
                </span>
                <a className="link" href={base + "Collections"}>Continue exploring</a>
              </div>
              {sampleProducts.map((product) => {
                const row = sampleCart.find((item) => item.id === product.id)!;
                return (
                  <article key={product.id} className="cart-product" data-testid={`row-cart-item-${product.id}`}>
                    <a className="cart-product-image" href={`${base}Product?id=${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`}>
                      <span className={`textile s${products.indexOf(product) % 6 + 1}`} role="img" aria-label={`${product.name} illustrative textile pattern`} />
                      <span className="cart-image-caption">Illustrative design</span>
                    </a>
                    <div className="cart-product-copy">
                      <span className="eyebrow">{product.weave} · {product.type}</span>
                      <a href={`${base}Product?id=${encodeURIComponent(product.id)}`}><h2>{product.name}</h2></a>
                      <p>Preview catalogue item</p>
                      <div className="cart-quantity">
                        <Qty value={row.qty} onChange={(quantity) => saveItems("kq-cart", sampleCart.map((item) => item.id === product.id ? { ...item, qty: quantity } : item))} />
                      </div>
                    </div>
                    <div className="cart-product-price">
                      <strong>{format(product.price * row.qty)}</strong>
                      <button
                        className="cart-remove"
                        type="button"
                        onClick={() => saveItems("kq-cart", sampleCart.filter((item) => item.id !== product.id))}
                        aria-label={`Remove ${product.name} from sample selections`}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </article>
                );
              })}
              <div className="cart-note">
                <Check size={16} aria-hidden="true" />
                <p>These are sample designs only. They are not included in secure checkout and cannot be purchased.</p>
              </div>
            </section>
            <aside className="panel cart-summary">
              <div className="summary-heading">
                <div>
                  <span className="eyebrow">Preview only</span>
                  <h2>Sample selection</h2>
                </div>
                <span className="summary-mark" aria-hidden="true"><ShoppingBag size={18} /></span>
              </div>
              <div className="summary-lines">
                <div className="row"><span>Illustrative subtotal</span><b>{format(moneySub(sampleCart))}</b></div>
                <div className="row summary-total"><strong>Payable total</strong><strong>Not available</strong></div>
              </div>
              <p className="muted">Sample items cannot be purchased. Add a verified, published Shopify saree to use secure checkout.</p>
              <a className="btn outline cart-checkout" href={base + "Collections"}>Browse available sarees <ArrowRight size={14} /></a>
              <p className="secure-caption">A verified Shopify product and a current delivery quote are required for Cashfree checkout.</p>
            </aside>
          </div>
        ) : (
          <div data-testid="empty-cart">
            <Empty title="Your bag is taking a quiet moment." copy="Explore the collection and add an available Shopify saree to your bag." />
          </div>
        )}

        {meta && sampleCart.length > 0 && (
          <section className="panel shopify-sample-selections cart-sample-note">
            <span className="eyebrow">Separate sample selections · not in your Shopify bag</span>
            <p className="muted">These illustrative items are not included in checkout. Remove them here to clear your sample list.</p>
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
      </div>
    </Shell>
  );
}

function ShopifyBag({
  cart,
  isLoading,
  isError,
  loadError,
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
  loadError: unknown;
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
    return <div className="cart-state cart-loading" role="status">
      <span className="eyebrow">Refreshing your bag</span>
      <h2>Gathering your pieces.</h2>
      <p>We’re checking your latest bag details with Shopify.</p>
      <div className="cart-loading-row" aria-hidden="true"><span /><div><i /><i /><i /></div></div>
    </div>;
  }

  if (isError || !cart) {
    return (
      <div className="cart-state" role="alert">
        <span className="state-symbol"><RefreshCw size={20} /></span>
        <span className="eyebrow">Shopify bag unavailable</span>
        <h2>Your saved bag could not be refreshed.</h2>
        <p className="muted" data-testid="error-shopify-cart-load">
          {getCartUpdateErrorMessage(loadError) || "Your saved Shopify cart may have expired, or Shopify could not be reached."}
        </p>
        <div className="actions">
          <button className="btn outline" type="button" onClick={onRetry}><RefreshCw size={14} /> Try again</button>
          <button className="link" type="button" onClick={onClear}>Clear this saved bag</button>
        </div>
      </div>
    );
  }

  if (cart.totalQuantity < 1 || !cart.lines.some((line) => line.quantity > 0)) {
    return (
      <div className="empty cart-empty">
        <span className="state-symbol"><ShoppingBag size={20} /></span>
        <span className="eyebrow">Shopify bag</span>
        <h2>Your bag is taking a quiet moment.</h2>
        <p>Explore the collection and add an available handloom saree to continue.</p>
        <button className="link" type="button" onClick={onClear}>Clear this saved bag</button>
        <a className="btn" href={base + "Collections"}>Browse sarees <ArrowRight size={14} /></a>
      </div>
    );
  }

  const hasUnavailableLine = cart.lines.some((line) => !line.availableForSale || line.isDemo);
  const canCheckout = cart.totalQuantity > 0 &&
    cart.lines.length > 0 &&
    cart.lines.every((line) => line.quantity > 0 && line.availableForSale && !line.isDemo);
  const updateErrorMessage = getCartUpdateErrorMessage(updateError);
  const discountErrorMessage = getCartUpdateErrorMessage(discountError);

  return (
    <div className="cart-layout">
      <section className="cart-items">
        <div className="cart-list-head">
          <span className="eyebrow" data-testid="text-cart-items-count">
            Shopify products · {cart.totalQuantity} {cart.totalQuantity === 1 ? "piece" : "pieces"}
          </span>
          <a className="link" href={base + "Collections"}>Continue exploring</a>
        </div>
        {updateErrorMessage && (
          <p className="notice cart-action-notice" role="alert">
            Shopify couldn’t update your bag: {updateErrorMessage} Your saved bag is unchanged. Please try again.
          </p>
        )}
        {cart.lines.map((line) => (
          <article className="cart-product shopify-cart-row" key={line.id}>
            <a className="cart-product-image" href={`${base}Product?shopify=${encodeURIComponent(line.productHandle)}`} aria-label={`View ${line.productTitle}`}>
              {line.image ? (
                <img src={line.image.url} alt={line.image.altText || line.productTitle} />
              ) : (
                <span className="shopify-cart-no-image">Photo not available</span>
              )}
            </a>
            <div className="cart-product-copy">
              <span className="eyebrow">Handloom saree</span>
              <a href={`${base}Product?shopify=${encodeURIComponent(line.productHandle)}`}><h2>{line.productTitle}</h2></a>
              {!isDefaultShopifyVariantTitle(line.variantTitle) && (
                <p className="cart-variant">{line.variantTitle}</p>
              )}
              {line.isDemo && <span className="pill shopify-demo-badge-inline">Demo only · not for sale</span>}
              {!line.availableForSale && <span className="pill cart-unavailable-badge">Currently unavailable</span>}
              <div className="cart-quantity">
                <Qty value={line.quantity} onChange={(quantity) => onQuantityChange(line.id, quantity)} />
              </div>
            </div>
            <div className="cart-product-price shopify-cart-line-total">
              <strong>{formatShopifyMoney(String(Number(line.unitPrice) * line.quantity), line.currencyCode)}</strong>
              <button className="cart-remove" type="button" disabled={isUpdating} onClick={() => onQuantityChange(line.id, 0)}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </article>
        ))}
        {isUpdating && <p role="status" className="muted">Updating your Shopify bag…</p>}
        <div className="cart-note">
          <Check size={16} aria-hidden="true" />
          <p>Your chosen pieces and current prices are synced from Shopify. Delivery and taxes are confirmed at checkout.</p>
        </div>
      </section>

      <aside className="panel cart-summary">
        <div className="summary-heading">
          <div>
            <span className="eyebrow">Your order</span>
            <h2>Selected with care.</h2>
          </div>
          <span className="summary-mark" aria-hidden="true"><ShoppingBag size={18} /></span>
        </div>
        <div className="summary-lines">
          <div className="row">
            <span>Subtotal before discounts</span>
            <b data-testid="text-shopify-cart-subtotal">{formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}</b>
          </div>
          {Number(cart.discountAmount) > 0 && (
            <div className="row">
              <span>Discount savings</span>
              <b data-testid="text-shopify-cart-discount">−{formatShopifyMoney(cart.discountAmount, cart.currencyCode)}</b>
            </div>
          )}
          <div className="row summary-total">
            <strong>Estimated total</strong>
            <strong data-testid="text-shopify-cart-total">{formatShopifyMoney(cart.totalAmount, cart.currencyCode)}</strong>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const code = discountCode.trim();
            if (code) onDiscountCodesChange(cart.id, [code]);
          }}
          className="cart-discount"
          aria-label="Apply a discount code"
        >
          <label htmlFor="shopify-discount-code">Have a discount code?</label>
          <div className="discount-entry">
            <input
              id="shopify-discount-code"
              data-testid="input-shopify-discount-code"
              value={discountCode}
              onChange={(event) => setDiscountCode(event.currentTarget.value)}
              autoComplete="off"
              maxLength={128}
              placeholder="Enter your code"
            />
            <button
              className="btn small outline"
              data-testid="button-apply-shopify-discount"
              type="submit"
              disabled={!discountCode.trim() || isApplyingDiscount}
            >
              {isApplyingDiscount ? "Applying…" : "Apply"}
            </button>
          </div>
        </form>
        {discountErrorMessage && (
          <p className="notice cart-action-notice" role="alert" data-testid="notice-shopify-discount-error">
            Shopify couldn’t update this code: {discountErrorMessage}
          </p>
        )}
        {cart.discountCodes.map((discount) => (
          <p
            className={discount.applicable ? "discount-status is-applied" : "discount-status is-rejected"}
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
            className="link remove-discount"
            data-testid="button-remove-shopify-discount"
            type="button"
            disabled={isApplyingDiscount}
            onClick={() => onDiscountCodesChange(cart.id, [])}
          >
            Remove discount code
          </button>
        )}
        {hasUnavailableLine ? (
          <p className="notice cart-action-notice" role="alert">A demo or unavailable listing is in this bag. Remove it or update its Shopify details before checkout.</p>
        ) : !canCheckout ? (
          <p className="notice cart-action-notice" role="alert">This bag could not be verified for secure checkout. Refresh your bag and try again.</p>
        ) : (
          <div className="cart-checkout-block">
            <a className="btn cart-checkout" href={base + "Checkout"} data-testid="link-site-checkout">
              Continue to checkout <ArrowRight size={14} />
            </a>
            <p className="secure-caption">Get a current delivery quote here · pay securely on Cashfree</p>
          </div>
        )}
        <p className="address-footnote cart-summary-footnote">Your delivery details and current shipping quote are confirmed on the next page. Import duties or customs charges may be separate.</p>
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
