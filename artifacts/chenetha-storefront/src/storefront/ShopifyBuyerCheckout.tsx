import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUser } from "@clerk/react";
import {
  getGetShopifyCheckoutPaymentStatusQueryKey,
  useCreateShopifyCheckoutPaymentSession,
  useCreateShopifyCheckoutQuote,
  useGetShopifyAvailableCountries,
  useGetShopifyCheckoutPaymentStatus,
  type ShopifyCartBuyerIdentityInput,
  type ShopifyCartResponse,
  type ShopifyCheckoutPaymentStatusResponse,
  type ShopifyCheckoutQuoteResponse,
} from "@workspace/api-client-react";
import { ArrowRight, Check, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import { base } from "./_shared";
import { useShopperPreferences } from "./ShopperPreferences";
import { formatShopifyMoney, isDefaultShopifyVariantTitle } from "./ShopifyCatalog";
import "./Checkout.css";

type CheckoutDetails = ShopifyCartBuyerIdentityInput["deliveryAddress"] & {
  email: string;
  phone: string;
};

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget: "_self" }) => Promise<unknown>;
    };
  }
}

const emptyDetails: CheckoutDetails = {
  email: "",
  phone: "",
  recipient: "",
  street: "",
  address2: "",
  city: "",
  state: "",
  pin: "",
  countryCode: "IN",
};

const phonePattern = /^\+[1-9]\d{7,14}$/;

export function ShopifyBuyerCheckout({ cart }: { cart: ShopifyCartResponse }) {
  const shopper = useShopperPreferences();
  const { user } = useUser();
  const detailsEdited = useRef(false);
  const [details, setDetails] = useState<CheckoutDetails>(emptyDetails);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [quote, setQuote] = useState<ShopifyCheckoutQuoteResponse | null>(null);
  const [returnOrderId] = useState(() => new URLSearchParams(window.location.search).get("cashfree_order_id")?.trim() ?? "");
  const cartFingerprint = JSON.stringify([cart.id, cart.subtotalAmount, cart.discountAmount, cart.totalAmount, cart.currencyCode, cart.lines.map((line) => [line.id, line.quantity, line.unitPrice])]);
  const previousCartFingerprint = useRef(cartFingerprint);
  const latestDetails = useRef(details);
  latestDetails.current = details;
  const latestCartFingerprint = useRef(cartFingerprint);
  latestCartFingerprint.current = cartFingerprint;
  const activeQuote = useRef<{ quoteId: string; fingerprint: string } | null>(null);

  const countriesQuery = useGetShopifyAvailableCountries();
  const createQuote = useCreateShopifyCheckoutQuote();
  const createPaymentSession = useCreateShopifyCheckoutPaymentSession();
  const paymentStatus = useGetShopifyCheckoutPaymentStatus(
    { orderId: returnOrderId },
    {
      query: {
        enabled: Boolean(returnOrderId),
        queryKey: getGetShopifyCheckoutPaymentStatusQueryKey({ orderId: returnOrderId }),
        refetchInterval: (query) => {
          const status = query.state.data;
          return status?.status === "completed" || status?.status === "payment_failed" ||
              status?.status === "shopify_synced" || status?.status === "refunded" ||
              status?.status === "refund_pending" || status?.status === "reconciliation_required" ||
              status?.paymentStatus === "FAILED" || status?.paymentStatus === "REFUNDED"
            ? false
            : 3000;
        },
      },
    },
  );

  const availableCountries = countriesQuery.data?.countries ?? [];
  const purchasable = cart.lines.length > 0 &&
    cart.totalQuantity > 0 &&
    cart.lines.every((line) => line.quantity > 0 && line.availableForSale && !line.isDemo);
  const quoteExpired = quote ? new Date(quote.expiresAt).getTime() <= Date.now() : false;

  useEffect(() => {
    if (shopper.loading || detailsEdited.current) return;
    const savedAddress = shopper.profile.addresses[0];
    setDetails({
      ...emptyDetails,
      email: shopper.profile.email.trim() || user?.primaryEmailAddress?.emailAddress.trim() || "",
      phone: toE164Phone(shopper.profile.phone) || toE164Phone(user?.primaryPhoneNumber?.phoneNumber ?? ""),
      recipient: savedAddress?.recipient || shopper.profile.name,
      street: savedAddress?.street ?? "",
      city: savedAddress?.city ?? "",
      state: savedAddress?.state ?? "",
      pin: savedAddress?.pin ?? "",
      countryCode: "IN",
    });
    setSelectedAddressId(savedAddress?.id ?? "");
  }, [shopper.loading, shopper.profile, user]);

  useEffect(() => {
    if (detailsEdited.current || !availableCountries.length) return;
    if (availableCountries.some((country) => country.isoCode === details.countryCode)) return;
    const defaultCountry = availableCountries.find((country) => country.isoCode === "IN") ?? availableCountries[0];
    setDetails((current) => ({ ...current, countryCode: defaultCountry.isoCode }));
  }, [availableCountries, details.countryCode]);

  useEffect(() => {
    if (!quote) return;
    const delay = Math.max(0, new Date(quote.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => discardQuote(), delay);
    return () => window.clearTimeout(timer);
  }, [quote]);

  useEffect(() => {
    if (previousCartFingerprint.current !== cartFingerprint) {
      previousCartFingerprint.current = cartFingerprint;
      discardQuote();
    }
  }, [cartFingerprint]);

  function discardQuote() {
    activeQuote.current = null;
    setQuote(null);
  }

  function fingerprint(input: ShopifyCartBuyerIdentityInput, currentCartFingerprint: string): string {
    return JSON.stringify([currentCartFingerprint, input]);
  }

  function updateField<K extends keyof CheckoutDetails>(key: K, value: CheckoutDetails[K]) {
    detailsEdited.current = true;
    setDetails((current) => ({ ...current, [key]: value }));
    discardQuote();
    setSubmitError("");
  }

  function selectSavedAddress(addressId: string) {
    detailsEdited.current = true;
    setSelectedAddressId(addressId);
    discardQuote();
    setSubmitError("");
    const address = shopper.profile.addresses.find((item) => item.id === addressId);
    setDetails((current) => ({
      ...current,
      recipient: address?.recipient ?? "",
      street: address?.street ?? "",
      address2: "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      pin: address?.pin ?? "",
      countryCode: "IN",
    }));
  }

  function buildQuoteInput(): ShopifyCartBuyerIdentityInput {
    return {
      cartId: cart.id,
      email: details.email.trim(),
      phone: details.phone.trim(),
      deliveryAddress: {
        recipient: details.recipient.trim(),
        street: details.street.trim(),
        ...(details.address2?.trim() ? { address2: details.address2.trim() } : {}),
        city: details.city.trim(),
        ...(details.state?.trim() ? { state: details.state.trim() } : {}),
        pin: details.pin.trim(),
        countryCode: details.countryCode,
      },
    };
  }

  async function loadCashfreeSdk(): Promise<void> {
    if (window.Cashfree) return;
    const existing = document.querySelector<HTMLScriptElement>('script[data-cashfree-sdk="true"]');
    if (existing) {
      await new Promise<void>((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Cashfree checkout could not be loaded.")), { once: true });
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
        script.async = true;
        script.dataset.cashfreeSdk = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Cashfree checkout could not be loaded."));
        document.head.appendChild(script);
      });
    }
    if (!window.Cashfree) throw new Error("Cashfree checkout is unavailable. Please try again.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!purchasable) {
      setSubmitError("This bag has an unavailable or demo product. Return to your bag and remove it before continuing.");
      return;
    }
    if (!phonePattern.test(details.phone.trim())) {
      setSubmitError("Enter a valid international phone number, such as +919876543210, before continuing.");
      return;
    }

    try {
      if (!quote || quoteExpired) {
        const input = buildQuoteInput();
        const requestedFingerprint = fingerprint(input, cartFingerprint);
        const freshQuote = await createQuote.mutateAsync({ data: input });
        const currentInput: ShopifyCartBuyerIdentityInput = {
          ...input,
          email: latestDetails.current.email.trim(),
          phone: latestDetails.current.phone.trim(),
          deliveryAddress: {
            recipient: latestDetails.current.recipient.trim(),
            street: latestDetails.current.street.trim(),
            ...(latestDetails.current.address2?.trim() ? { address2: latestDetails.current.address2.trim() } : {}),
            city: latestDetails.current.city.trim(),
            ...(latestDetails.current.state?.trim() ? { state: latestDetails.current.state.trim() } : {}),
            pin: latestDetails.current.pin.trim(),
            countryCode: latestDetails.current.countryCode,
          },
        };
        if (requestedFingerprint !== fingerprint(currentInput, latestCartFingerprint.current)) {
          throw new Error("Your delivery details or bag changed while the quote was being prepared. Request a fresh quote.");
        }
        activeQuote.current = { quoteId: freshQuote.quoteId, fingerprint: requestedFingerprint };
        setQuote(freshQuote);
        return;
      }
      const quoteBeingPaid = activeQuote.current;
      if (!quoteBeingPaid || quoteBeingPaid.quoteId !== quote.quoteId) {
        discardQuote();
        throw new Error("Your delivery quote is no longer current. Request a fresh quote.");
      }
      const session = await createPaymentSession.mutateAsync({ data: { quoteId: quote.quoteId } });
      const latestInput: ShopifyCartBuyerIdentityInput = {
        ...buildQuoteInput(),
        email: latestDetails.current.email.trim(),
        phone: latestDetails.current.phone.trim(),
        deliveryAddress: {
          recipient: latestDetails.current.recipient.trim(),
          street: latestDetails.current.street.trim(),
          ...(latestDetails.current.address2?.trim() ? { address2: latestDetails.current.address2.trim() } : {}),
          city: latestDetails.current.city.trim(),
          ...(latestDetails.current.state?.trim() ? { state: latestDetails.current.state.trim() } : {}),
          pin: latestDetails.current.pin.trim(),
          countryCode: latestDetails.current.countryCode,
        },
      };
      if (activeQuote.current?.quoteId !== quoteBeingPaid.quoteId ||
          fingerprint(latestInput, latestCartFingerprint.current) !== quoteBeingPaid.fingerprint) {
        throw new Error("Your delivery details or bag changed before payment opened. Request a fresh quote.");
      }
      await loadCashfreeSdk();
      const result = await window.Cashfree!({ mode: session.environment }).checkout({
        paymentSessionId: session.paymentSessionId,
        redirectTarget: "_self",
      });
      if (result && typeof result === "object" && "error" in result) {
        throw new Error("Cashfree could not open the secure payment step. Please try again.");
      }
    } catch (error) {
      setSubmitError(getApiError(error) ?? (error instanceof Error ? error.message : null) ??
        "We couldn’t prepare secure payment. Your bag is unchanged; please try again.");
    }
  }

  if (returnOrderId) {
    return (
      <PaymentReturnState
        orderId={returnOrderId}
        status={paymentStatus.data}
        isLoading={paymentStatus.isLoading}
        isError={paymentStatus.isError}
        onRetry={() => void paymentStatus.refetch()}
      />
    );
  }

  if (!purchasable) {
    return (
      <div className="panel checkout-unavailable" role="alert" data-testid="notice-shopify-cart-not-purchasable">
        <span className="eyebrow">Checkout unavailable</span>
        <h2>This bag needs an update.</h2>
        <p className="muted">Remove demo or unavailable products from your bag before continuing.</p>
        <a className="btn" href={base + "Cart"}>Return to your bag <ArrowRight size={14} /></a>
      </div>
    );
  }

  const busy = createQuote.isPending || createPaymentSession.isPending;
  return (
    <div className="checkout-layout">
      <form className="panel checkout-details" onSubmit={(event) => void submit(event)}>
        <div className="checkout-section-heading">
          <span className="eyebrow">Step 1 · Delivery details</span>
          <h2>Where should we send your order?</h2>
          <p className="muted">Your details prepare this order and are not saved to your profile.</p>
        </div>
        <div className="checkout-form-section">
          <h3>Contact</h3>
          <div className="checkout-field">
            <label htmlFor="checkout-email">Email address</label>
            <input id="checkout-email" data-testid="input-checkout-email" type="email" autoComplete="email" maxLength={254} required value={details.email} onChange={(event) => updateField("email", event.currentTarget.value)} />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-phone">International phone number</label>
            <input id="checkout-phone" data-testid="input-checkout-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={16} pattern="\+[1-9][0-9]{7,14}" title="Use international format, for example +919876543210." placeholder="+919876543210" required value={details.phone} onChange={(event) => updateField("phone", event.currentTarget.value)} />
            <small>Required for delivery updates. Include the plus sign and country code.</small>
          </div>
        </div>
        <div className="checkout-form-section">
          <h3>Delivery address</h3>
          {shopper.profile.addresses.length > 0 && (
            <div className="checkout-field">
              <label htmlFor="checkout-saved-address">Use a saved address</label>
              <select id="checkout-saved-address" data-testid="select-checkout-saved-address" value={selectedAddressId} onChange={(event) => selectSavedAddress(event.currentTarget.value)}>
                <option value="">Enter a different address</option>
                {shopper.profile.addresses.map((address) => <option value={address.id} key={address.id}>{address.label} · {address.city}</option>)}
              </select>
            </div>
          )}
          <div className="checkout-field">
            <label htmlFor="checkout-recipient">Full name</label>
            <input id="checkout-recipient" data-testid="input-checkout-recipient" autoComplete="name" maxLength={160} required value={details.recipient} onChange={(event) => updateField("recipient", event.currentTarget.value)} />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-country">Country / region</label>
            <select id="checkout-country" data-testid="select-checkout-country" autoComplete="country" required disabled={countriesQuery.isLoading || availableCountries.length === 0} value={details.countryCode} onChange={(event) => updateField("countryCode", event.currentTarget.value)}>
              {availableCountries.map((country) => <option key={country.isoCode} value={country.isoCode}>{country.name}</option>)}
            </select>
            {countriesQuery.isLoading && <small role="status">Loading delivery countries…</small>}
            {countriesQuery.isError && <small className="checkout-inline-error" role="alert">Delivery countries could not be loaded. <button className="checkout-retry" type="button" onClick={() => void countriesQuery.refetch()}>Try again</button></small>}
            {!countriesQuery.isLoading && !countriesQuery.isError && !availableCountries.length && <small className="checkout-inline-error" role="alert">No delivery countries are enabled yet.</small>}
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-address1">Address</label>
            <input id="checkout-address1" data-testid="input-checkout-address1" autoComplete="address-line1" maxLength={500} required value={details.street} onChange={(event) => updateField("street", event.currentTarget.value)} />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-address2">Apartment, suite, unit <span>optional</span></label>
            <input id="checkout-address2" data-testid="input-checkout-address2" autoComplete="address-line2" maxLength={500} value={details.address2 ?? ""} onChange={(event) => updateField("address2", event.currentTarget.value)} />
          </div>
          <div className="checkout-form-grid">
            <div className="checkout-field">
              <label htmlFor="checkout-city">City</label>
              <input id="checkout-city" data-testid="input-checkout-city" autoComplete="address-level2" maxLength={160} required value={details.city} onChange={(event) => updateField("city", event.currentTarget.value)} />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-state">State / province <span>optional</span></label>
              <input id="checkout-state" data-testid="input-checkout-state" autoComplete="address-level1" maxLength={160} value={details.state ?? ""} onChange={(event) => updateField("state", event.currentTarget.value)} />
            </div>
          </div>
          <div className="checkout-field checkout-postal">
            <label htmlFor="checkout-postal">Postal / PIN code</label>
            <input id="checkout-postal" data-testid="input-checkout-postal" autoComplete="postal-code" maxLength={32} required value={details.pin} onChange={(event) => updateField("pin", event.currentTarget.value)} />
          </div>
        </div>
        {submitError && <p className="notice checkout-error" role="alert" data-testid="error-checkout-submit">{submitError}</p>}
        <button className="btn checkout-submit" type="submit" data-testid="button-submit-checkout-details" disabled={busy || countriesQuery.isLoading || countriesQuery.isError || !availableCountries.length}>
          {createQuote.isPending ? "Getting delivery quote…" : createPaymentSession.isPending ? "Opening secure payment…" : quote && !quoteExpired ? "Continue to Cashfree" : "Get delivery quote"}
          <ArrowRight size={15} />
        </button>
        <p className="checkout-secure-note"><LockKeyhole size={13} /> Your payment details are entered only on Cashfree’s secure hosted page.</p>
      </form>

      <aside className="panel checkout-summary">
        <span className="eyebrow">Step 2 · Your order</span>
        <h2>Order summary</h2>
        <div className="checkout-lines">
          {cart.lines.map((line) => (
            <div className="checkout-line" key={line.id}>
              <div><strong>{line.productTitle}</strong>{!isDefaultShopifyVariantTitle(line.variantTitle) && <small>{line.variantTitle} · </small>}<small>{line.quantity} × {formatShopifyMoney(line.unitPrice, line.currencyCode)}</small></div>
              <strong>{formatShopifyMoney(String(Number(line.unitPrice) * line.quantity), line.currencyCode)}</strong>
            </div>
          ))}
        </div>
        {quote ? (
          <>
            <div className="checkout-total-row"><span>Items subtotal</span><strong data-testid="text-checkout-item-subtotal">{formatShopifyMoney(quote.itemSubtotal, quote.currencyCode)}</strong></div>
            <div className="checkout-total-row is-discount"><span>Discount</span><strong data-testid="text-checkout-discount">−{formatShopifyMoney(quote.discountAmount, quote.currencyCode)}</strong></div>
            <div className="checkout-total-row"><span>Shipping · {quote.courierName || quote.carrier}</span><strong data-testid="text-checkout-shipping">{formatShopifyMoney(quote.shippingAmount, quote.currencyCode)}</strong></div>
            <div className="checkout-total-row checkout-grand-total"><strong>Total to pay</strong><strong data-testid="text-checkout-total">{formatShopifyMoney(quote.totalAmount, quote.currencyCode)}</strong></div>
            <div className="checkout-quote-meta">
              <span>{quote.carrier} · {quote.courierName} · {quote.parcelCount} {quote.parcelCount === 1 ? "parcel" : "parcels"}</span>
              <span>{quoteExpired ? "Quote expired. Request a fresh quote." : `Quote valid until ${formatExpiry(quote.expiresAt)}`}</span>
            </div>
          </>
        ) : (
          <>
            <div className="checkout-total-row"><span>Items subtotal</span><strong data-testid="text-checkout-item-subtotal">{formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}</strong></div>
            <div className="checkout-total-row"><span>Shipping and total</span><strong>Shown after quote</strong></div>
          </>
        )}
        <p className="checkout-customs-note" role="note" data-testid="checkout-customs-note">
          Import duties and customs charges are excluded unless included in the carrier quote. These may be collected separately on delivery.
        </p>
        <p className="checkout-summary-note">Your delivery address and parcel details are shared with Shiprocket to calculate the quote.</p>
        {quote?.excludedCharges.length ? <p className="checkout-summary-note">Not included: {quote.excludedCharges.join(", ")}.</p> : null}
        <div className="checkout-payment-trust"><ShieldCheck size={17} /><span>Secure payment on Cashfree’s hosted checkout page</span></div>
        <a className="link checkout-return-link" href={base + "Cart"}>Return to your bag</a>
      </aside>
    </div>
  );
}

function PaymentReturnState({
  orderId,
  status,
  isLoading,
  isError,
  onRetry,
}: {
  orderId: string;
  status: ShopifyCheckoutPaymentStatusResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const completed = status?.status === "completed";
  const orderRecorded = status?.status === "shopify_synced";
  const paidSyncing = status?.paymentStatus === "PAID" && !completed && !orderRecorded;
  const failed = status?.paymentStatus === "FAILED" || status?.status === "payment_failed";
  const reconciliation = status?.status === "refund_pending" ||
    status?.status === "refunded" || status?.status === "reconciliation_required";
  const pending = status?.paymentStatus === "PENDING" || status?.status === "payment_pending";
  const title = completed
    ? "Your order is confirmed."
    : orderRecorded
      ? "Your order is recorded."
    : failed
      ? "Payment was not completed."
      : reconciliation
        ? "Payment needs a review."
      : paidSyncing
        ? "Payment received."
        : pending
          ? "Payment is pending."
          : "Checking your payment.";
  const description = completed
    ? `Your payment is verified and order ${status?.shopifyOrderName || orderId} is complete.`
    : orderRecorded
      ? status?.message || `Your verified payment is recorded as order ${status?.shopifyOrderName || orderId}.`
    : failed
      ? status?.message || "The payment could not be confirmed. You can return to your bag and try again."
      : reconciliation
        ? status?.message || "The payment or refund needs merchant review. Do not pay again."
      : paidSyncing
        ? status?.message || "Your payment is verified. We’re finishing the handloom order record with the store."
        : pending
          ? status?.message || "Cashfree is still processing this payment. We’ll keep checking with the payment service."
        : status?.message || "Cashfree has returned you to Chenetha. We’re verifying the payment securely with the server.";
  return (
    <section className={`panel checkout-return-state ${failed ? "is-failed" : completed ? "is-complete" : ""}`} aria-live="polite" data-testid="status-cashfree-payment">
      <div className="checkout-return-mark">{failed || reconciliation ? <CircleAlert size={25} /> : completed || orderRecorded ? <Check size={25} /> : <LockKeyhole size={24} />}</div>
      <span className="eyebrow">{failed || reconciliation ? "Payment status" : completed ? "Order complete" : orderRecorded ? "Order recorded" : "Secure payment verification"}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {isLoading && <div className="checkout-status-skeleton" role="status">Contacting the payment service…</div>}
      {isError && <div className="checkout-status-retry" role="alert">We can’t confirm the payment status yet. <button className="checkout-retry" type="button" onClick={onRetry}>Check again</button></div>}
      {!completed && !orderRecorded && !failed && !reconciliation && <p className="checkout-summary-note">Please keep this page open while we verify the result. The return from Cashfree alone does not confirm payment.</p>}
      {(completed || orderRecorded) && status?.shopifyOrderName && <p className="checkout-order-number">Order reference <strong>{status.shopifyOrderName}</strong></p>}
      {completed || orderRecorded ? (
        <a className="btn" href={base + "Orders"}>View your orders <ArrowRight size={14} /></a>
      ) : failed ? (
        <a className="btn" href={base + "Cart"}>Return to your bag <ArrowRight size={14} /></a>
      ) : reconciliation ? (
        <a className="btn" href={base + "Contact"}>Contact the store <ArrowRight size={14} /></a>
      ) : (
        <button className="btn" type="button" onClick={onRetry}>Check payment status <ArrowRight size={14} /></button>
      )}
    </section>
  );
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getApiError(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim() ? data.error.trim() : null;
}

function toE164Phone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return "";
  const digits = trimmed.slice(1).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : "";
}
