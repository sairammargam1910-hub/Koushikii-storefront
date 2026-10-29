import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, Trash2 } from "lucide-react";
import {
  updateShopifyCartBuyerIdentity,
  updateShopifyCartDiscountCodes,
  updateShopifyCartLines,
  type ShopifyCartBuyerIdentityInput,
  type ShopifyCartResponse,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
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
import { useShopperPreferences } from "./ShopperPreferences";

export function Cart() {
  const shopper = useShopperPreferences();
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
  const updateBuyerIdentity = useMutation({
    mutationFn: (data: ShopifyCartBuyerIdentityInput) => updateShopifyCartBuyerIdentity(data),
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
            loadError={shopifyCart.error}
            isUpdating={updateLine.isPending}
            updateError={updateLine.error}
            isApplyingDiscount={updateDiscountCodes.isPending}
            discountError={updateDiscountCodes.error}
            profile={shopper.profile}
            profileLoading={shopper.loading}
            signedIn={shopper.signedIn}
            isPreparingCheckout={updateBuyerIdentity.isPending}
            checkoutPrepError={updateBuyerIdentity.error}
            onRetry={() => shopifyCart.refetch()}
            onClear={clearShopifyCartMeta}
            onDiscountCodesChange={(cartId, discountCodes) =>
              updateDiscountCodes.mutate({ cartId, discountCodes })
            }
            onPrepareCheckout={(data) => updateBuyerIdentity.mutateAsync(data)}
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
  loadError,
  isUpdating,
  updateError,
  isApplyingDiscount,
  discountError,
  profile,
  profileLoading,
  signedIn,
  isPreparingCheckout,
  checkoutPrepError,
  onPrepareCheckout,
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
  profile: ReturnType<typeof useShopperPreferences>["profile"];
  profileLoading: boolean;
  signedIn: boolean;
  isPreparingCheckout: boolean;
  checkoutPrepError: unknown;
  onRetry: () => void;
  onClear: () => void;
  onQuantityChange: (lineId: string, quantity: number) => void;
  onDiscountCodesChange: (cartId: string, discountCodes: string[]) => void;
  onPrepareCheckout: (data: ShopifyCartBuyerIdentityInput) => Promise<ShopifyCartResponse>;
}) {
  const [discountCode, setDiscountCode] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const { user } = useUser();

  if (isLoading) {
    return <div className="shopify-catalog-status" role="status">Refreshing your Shopify bag…</div>;
  }

  if (isError || !cart) {
    return (
      <div className="panel" role="alert">
        <span className="eyebrow">Shopify bag unavailable</span>
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
  const checkoutHref = getShopifyCheckoutHref(cart.checkoutUrl);
  const canCheckout = Boolean(checkoutHref) &&
    cart.totalQuantity > 0 &&
    cart.lines.length > 0 &&
    cart.lines.every((line) => line.quantity > 0 && line.availableForSale && !line.isDemo);
  const updateErrorMessage = getCartUpdateErrorMessage(updateError);
  const discountErrorMessage = getCartUpdateErrorMessage(discountError);
  const checkoutPrepErrorMessage = getCartUpdateErrorMessage(checkoutPrepError);
  const savedAddresses = signedIn ? profile.addresses : [];
  const selectedAddress =
    savedAddresses.find((address) => address.id === selectedAddressId) ??
    savedAddresses[0] ??
    null;

  async function continueWithSavedAddress() {
    if (!cart || !checkoutHref || !selectedAddress) return;
    setCheckoutError("");
    const email = profile.email.trim() || user?.primaryEmailAddress?.emailAddress.trim() || "";
    const phone = profile.phone.trim() || user?.primaryPhoneNumber?.phoneNumber.trim() || "";
    try {
      const updatedCart = await onPrepareCheckout({
        cartId: cart.id,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        deliveryAddress: {
          recipient: selectedAddress.recipient,
          street: selectedAddress.street,
          city: selectedAddress.city,
          state: selectedAddress.state,
          pin: selectedAddress.pin,
        },
      });
      const updatedCheckoutUrl = getShopifyCheckoutHref(updatedCart.checkoutUrl);
      if (!updatedCheckoutUrl) {
        throw new Error("Shopify did not return a checkout link.");
      }
      window.location.assign(updatedCheckoutUrl);
    } catch {
      setCheckoutError(
        getCartUpdateErrorMessage(checkoutPrepError) ??
          "Your saved details could not be added to Shopify checkout. Please try again.",
      );
    }
  }

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
          <span>Subtotal before discounts</span>
          <b data-testid="text-shopify-cart-subtotal">{formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}</b>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <strong>Estimated total</strong>
          <strong data-testid="text-shopify-cart-total">{formatShopifyMoney(cart.totalAmount, cart.currencyCode)}</strong>
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
        {profileLoading && signedIn ? (
          <p className="muted" role="status">Loading your saved checkout details…</p>
        ) : selectedAddress ? (
          <div className="guide-note" style={{ marginTop: 18 }}>
            {savedAddresses.length > 1 ? (
              <label className="field" htmlFor="shopify-saved-address">
                Use a saved delivery address
                <select
                  id="shopify-saved-address"
                  data-testid="select-shopify-saved-address"
                  value={selectedAddress.id}
                  onChange={(event) => setSelectedAddressId(event.currentTarget.value)}
                >
                  {savedAddresses.map((address) => (
                    <option value={address.id} key={address.id}>
                      {address.label} · {address.city}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <span className="eyebrow">Saved delivery address</span>
                <p style={{ margin: "8px 0 0" }}>
                  {selectedAddress.recipient} · {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pin}
                </p>
              </>
            )}
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Continue with this address to send it, along with your saved contact details, to Shopify checkout.
            </p>
            {(checkoutPrepErrorMessage || checkoutError) && (
              <p className="notice" role="alert" data-testid="error-shopify-checkout-prefill">
                {checkoutPrepErrorMessage || checkoutError}
              </p>
            )}
            <button
              className="btn"
              style={{ width: "100%", marginTop: 14 }}
              type="button"
              data-testid="button-continue-shopify-checkout-with-profile"
              onClick={() => void continueWithSavedAddress()}
              disabled={isPreparingCheckout || !canCheckout}
            >
              {isPreparingCheckout ? "Preparing secure checkout…" : "Continue to Shopify with saved details"}
              <ArrowRight size={14} />
            </button>
          </div>
        ) : signedIn && !profileLoading ? (
          <p className="muted" style={{ marginTop: 18 }}>
            Save a delivery address in <a className="link" href={base + "Profile#saved-addresses"}>My profile</a> to prefill Shopify checkout. Otherwise, Shopify will ask for it there.
          </p>
        ) : null}
        <p className="muted">Shopify may adjust delivery, taxes, and the final payable amount at checkout.</p>
        {hasUnavailableLine ? (
          <p className="notice" role="alert">A demo or unavailable listing is in this bag. Remove it or update its Shopify details before checkout.</p>
        ) : !canCheckout ? (
          <p className="notice" role="alert">Shopify could not provide a secure checkout link for this bag. Refresh your bag and try again.</p>
        ) : selectedAddress ? (
          <p className="muted" style={{ fontSize: 12 }}>Your saved address is ready to prefill above. Continue there to send it securely to Shopify.</p>
        ) : profileLoading && signedIn ? (
          <div>
            <p className="muted" role="status">Loading your saved checkout details…</p>
            <a className="link" href={checkoutHref!}>Continue without prefill</a>
          </div>
        ) : (
          <a className="btn" style={{ width: "100%", marginTop: 18 }} href={checkoutHref!} data-testid="link-shopify-checkout">
            Continue to secure Shopify checkout <ArrowRight size={14} />
          </a>
        )}
        <p className="muted" style={{ fontSize: 11 }}>You can review or edit the delivery details at Shopify checkout. Payment details stay with Shopify.</p>
      </aside>
    </div>
  );
}

function getShopifyCheckoutHref(checkoutUrl: string | null | undefined): string | null {
  try {
    const url = checkoutUrl ? new URL(checkoutUrl) : null;
    return url?.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getCartUpdateErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim()
    ? data.error.trim()
    : null;
}
