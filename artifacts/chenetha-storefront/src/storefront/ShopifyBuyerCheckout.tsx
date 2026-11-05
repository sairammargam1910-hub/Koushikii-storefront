import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getShopifyAvailableCountries,
  updateShopifyCartBuyerIdentity,
  type ShopifyCartBuyerIdentityInput,
  type ShopifyCartResponse,
} from "@workspace/api-client-react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { base } from "./_shared";
import { useShopperPreferences } from "./ShopperPreferences";
import {
  formatShopifyMoney,
  isDefaultShopifyVariantTitle,
  updateShopifyCartCache,
} from "./ShopifyCatalog";
import "./Checkout.css";

type CheckoutDetails = ShopifyCartBuyerIdentityInput["deliveryAddress"] & {
  email: string;
  phone: string;
};

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

export function ShopifyBuyerCheckout({ cart }: { cart: ShopifyCartResponse }) {
  const shopper = useShopperPreferences();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const detailsEdited = useRef(false);
  const [details, setDetails] = useState<CheckoutDetails>(emptyDetails);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [submitError, setSubmitError] = useState("");

  const countriesQuery = useQuery({
    queryKey: ["/api/shopify/countries"],
    queryFn: ({ signal }) => getShopifyAvailableCountries({ signal }),
    staleTime: 5 * 60 * 1000,
  });
  const prepareCheckout = useMutation({
    mutationFn: (data: ShopifyCartBuyerIdentityInput) =>
      updateShopifyCartBuyerIdentity(data),
    onSuccess: (updatedCart) => updateShopifyCartCache(queryClient, updatedCart),
  });

  const availableCountries = countriesQuery.data?.countries ?? [];
  const purchasable = cart.lines.length > 0 &&
    cart.totalQuantity > 0 &&
    cart.lines.every((line) => line.quantity > 0 && line.availableForSale && !line.isDemo);
  const checkoutHref = getSecureCheckoutHref(cart.checkoutUrl);

  useEffect(() => {
    if (shopper.loading || detailsEdited.current) return;
    const savedAddress = shopper.profile.addresses[0];
    setDetails({
      ...emptyDetails,
      email: shopper.profile.email.trim() ||
        user?.primaryEmailAddress?.emailAddress.trim() || "",
      phone: shopper.profile.phone.trim() ||
        user?.primaryPhoneNumber?.phoneNumber.trim() || "",
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
    const defaultCountry = availableCountries.find((country) => country.isoCode === "IN") ??
      availableCountries[0];
    setDetails((current) => ({ ...current, countryCode: defaultCountry.isoCode }));
  }, [availableCountries, details.countryCode]);

  function updateField<K extends keyof CheckoutDetails>(
    key: K,
    value: CheckoutDetails[K],
  ) {
    detailsEdited.current = true;
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function selectSavedAddress(addressId: string) {
    detailsEdited.current = true;
    setSelectedAddressId(addressId);
    const address = shopper.profile.addresses.find((item) => item.id === addressId);
    if (!address) {
      setDetails((current) => ({
        ...current,
        recipient: "",
        street: "",
        address2: "",
        city: "",
        state: "",
        pin: "",
        countryCode: "IN",
      }));
      return;
    }
    setDetails((current) => ({
      ...current,
      recipient: address.recipient,
      street: address.street,
      address2: "",
      city: address.city,
      state: address.state,
      pin: address.pin,
      countryCode: "IN",
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!purchasable) {
      setSubmitError("This bag has an unavailable or demo product. Return to your bag and remove it before continuing.");
      return;
    }
    if (!checkoutHref) {
      setSubmitError("Shopify hasn’t provided a secure checkout link. Refresh your bag and try again.");
      return;
    }

    const payload: ShopifyCartBuyerIdentityInput = {
      cartId: cart.id,
      email: details.email.trim(),
      ...(details.phone.trim() ? { phone: details.phone.trim() } : {}),
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

    try {
      const updatedCart = await prepareCheckout.mutateAsync(payload);
      const secureUrl = getSecureCheckoutHref(updatedCart.checkoutUrl);
      if (!secureUrl) throw new Error("Shopify did not provide a secure checkout link.");
      window.location.assign(secureUrl);
    } catch (error) {
      setSubmitError(getApiError(error) ??
        "We couldn’t prepare the secure payment step. Your bag is unchanged; please try again.");
    }
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

  return (
    <div className="checkout-layout">
      <form className="panel checkout-details" onSubmit={(event) => void submit(event)}>
        <div className="checkout-section-heading">
          <span className="eyebrow">Step 1 · Delivery details</span>
          <h2>Where should we send your order?</h2>
          <p className="muted">Your details are used to prepare this order. New address edits are not saved to your profile.</p>
        </div>

        <div className="checkout-form-section">
          <h3>Contact</h3>
          <div className="checkout-field">
            <label htmlFor="checkout-email">Email address</label>
            <input
              id="checkout-email"
              data-testid="input-checkout-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={details.email}
              onChange={(event) => updateField("email", event.currentTarget.value)}
            />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-phone">Phone <span>optional</span></label>
            <input
              id="checkout-phone"
              data-testid="input-checkout-phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              pattern="\\+[1-9][0-9]{7,14}"
              title="Use international format, for example +919876543210."
              placeholder="+919876543210"
              value={details.phone}
              onChange={(event) => updateField("phone", event.currentTarget.value)}
            />
            <small>Include the country code if you enter a phone number.</small>
          </div>
        </div>

        <div className="checkout-form-section">
          <h3>Delivery address</h3>
          {shopper.profile.addresses.length > 0 && (
            <div className="checkout-field">
              <label htmlFor="checkout-saved-address">Use a saved address</label>
              <select
                id="checkout-saved-address"
                data-testid="select-checkout-saved-address"
                value={selectedAddressId}
                onChange={(event) => selectSavedAddress(event.currentTarget.value)}
              >
                <option value="">Enter a different address</option>
                {shopper.profile.addresses.map((address) => (
                  <option value={address.id} key={address.id}>
                    {address.label} · {address.city}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="checkout-field">
            <label htmlFor="checkout-recipient">Full name</label>
            <input
              id="checkout-recipient"
              data-testid="input-checkout-recipient"
              autoComplete="name"
              maxLength={160}
              required
              value={details.recipient}
              onChange={(event) => updateField("recipient", event.currentTarget.value)}
            />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-country">Country / region</label>
            <select
              id="checkout-country"
              data-testid="select-checkout-country"
              autoComplete="country"
              required
              disabled={countriesQuery.isLoading || availableCountries.length === 0}
              value={details.countryCode}
              onChange={(event) => updateField("countryCode", event.currentTarget.value)}
            >
              {availableCountries.map((country) => (
                <option key={country.isoCode} value={country.isoCode}>{country.name}</option>
              ))}
            </select>
            {countriesQuery.isLoading && <small role="status">Loading delivery countries…</small>}
            {countriesQuery.isError && (
              <small className="checkout-inline-error" role="alert">
                Delivery countries could not be loaded. Try again before continuing.
              </small>
            )}
            {!countriesQuery.isLoading && !countriesQuery.isError && availableCountries.length === 0 && (
              <small className="checkout-inline-error" role="alert">
                No delivery countries are enabled in Shopify yet.
              </small>
            )}
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-address1">Address</label>
            <input
              id="checkout-address1"
              data-testid="input-checkout-address1"
              autoComplete="address-line1"
              maxLength={500}
              required
              value={details.street}
              onChange={(event) => updateField("street", event.currentTarget.value)}
            />
          </div>
          <div className="checkout-field">
            <label htmlFor="checkout-address2">Apartment, suite, unit <span>optional</span></label>
            <input
              id="checkout-address2"
              data-testid="input-checkout-address2"
              autoComplete="address-line2"
              maxLength={500}
              value={details.address2 ?? ""}
              onChange={(event) => updateField("address2", event.currentTarget.value)}
            />
          </div>
          <div className="checkout-form-grid">
            <div className="checkout-field">
              <label htmlFor="checkout-city">City</label>
              <input
                id="checkout-city"
                data-testid="input-checkout-city"
                autoComplete="address-level2"
                maxLength={160}
                required
                value={details.city}
                onChange={(event) => updateField("city", event.currentTarget.value)}
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-state">State / province <span>optional</span></label>
              <input
                id="checkout-state"
                data-testid="input-checkout-state"
                autoComplete="address-level1"
                maxLength={160}
                value={details.state ?? ""}
                onChange={(event) => updateField("state", event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="checkout-field checkout-postal">
            <label htmlFor="checkout-postal">Postal / PIN code</label>
            <input
              id="checkout-postal"
              data-testid="input-checkout-postal"
              autoComplete="postal-code"
              maxLength={32}
              required
              value={details.pin}
              onChange={(event) => updateField("pin", event.currentTarget.value)}
            />
          </div>
        </div>

        {submitError && <p className="notice checkout-error" role="alert" data-testid="error-checkout-submit">{submitError}</p>}
        <button
          className="btn checkout-submit"
          type="submit"
          data-testid="button-submit-checkout-details"
          disabled={prepareCheckout.isPending || countriesQuery.isLoading || countriesQuery.isError || availableCountries.length === 0}
        >
          {prepareCheckout.isPending ? "Preparing secure payment…" : "Continue to secure payment"}
          <ArrowRight size={15} />
        </button>
        <p className="checkout-secure-note">
          <LockKeyhole size={13} /> Payment details are entered securely on Shopify.
        </p>
      </form>

      <aside className="panel checkout-summary">
        <span className="eyebrow">Step 2 · Secure payment</span>
        <h2>Your order</h2>
        <div className="checkout-lines">
          {cart.lines.map((line) => (
            <div className="checkout-line" key={line.id}>
              <div>
                <strong>{line.productTitle}</strong>
                {!isDefaultShopifyVariantTitle(line.variantTitle) && (
                  <small>{line.variantTitle} · </small>
                )}
                <small>{line.quantity} × {formatShopifyMoney(line.unitPrice, line.currencyCode)}</small>
              </div>
              <strong>{formatShopifyMoney(String(Number(line.unitPrice) * line.quantity), line.currencyCode)}</strong>
            </div>
          ))}
        </div>
        <div className="checkout-total-row">
          <span>Subtotal before discounts</span>
          <strong data-testid="text-shopify-checkout-subtotal">
            {formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}
          </strong>
        </div>
        {Number(cart.discountAmount) > 0 && (
          <div className="checkout-total-row is-discount">
            <span>Discount savings</span>
            <strong data-testid="text-shopify-checkout-discount">
              −{formatShopifyMoney(cart.discountAmount, cart.currencyCode)}
            </strong>
          </div>
        )}
        <div className="checkout-total-row checkout-grand-total">
          <strong>Estimated total</strong>
          <strong data-testid="text-shopify-checkout-total">
            {formatShopifyMoney(cart.totalAmount, cart.currencyCode)}
          </strong>
        </div>
        {cart.discountCodes.map((discount) => (
          <p
            className={discount.applicable ? "checkout-discount-success" : "notice"}
            role={discount.applicable ? "status" : "alert"}
            key={discount.code}
          >
            {discount.applicable
              ? `Discount code ${discount.code} is applied.`
              : `Discount code ${discount.code} does not apply to this bag.`}
          </p>
        ))}
        <p className="checkout-summary-note">
          Shipping and taxes are calculated by Shopify after your address is submitted. Shopify shows the final amount before you pay.
        </p>
        <div className="checkout-payment-trust">
          <ShieldCheck size={17} />
          <span>Secure payment and order confirmation by Shopify</span>
        </div>
        <a className="link checkout-return-link" href={base + "Cart"}>Return to your bag</a>
      </aside>
    </div>
  );
}

function getSecureCheckoutHref(checkoutUrl: string | null | undefined): string | null {
  try {
    const url = checkoutUrl ? new URL(checkoutUrl) : null;
    return url?.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getApiError(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim() ? data.error.trim() : null;
}
