import { Show, useClerk, useUser } from "@clerk/react";
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

function SignedInAccount() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;
  const displayName =
    user?.fullName || user?.firstName || email || "Chenetha customer";

  return (
    <section className="account-welcome" data-testid="panel-signed-in-account">
      <div className="account-welcome-mark" aria-hidden="true"><UserRound size={24} /></div>
      <div className="account-welcome-copy">
        <span className="eyebrow">Your Chenetha account</span>
        <h2>Welcome back, {displayName}.</h2>
        {email && <p className="account-identity"><span>Signed in as</span> {email}</p>}
        <p className="account-checkout-note">
          Your saved preferences are private to this Chenetha account. Sign in on another
          device to find them there.
        </p>
        <div className="account-actions">
          <a className="btn" href={base + "Profile"} data-testid="link-saved-preferences">
            View saved details <ArrowRight size={15} aria-hidden="true" />
          </a>
          <button
            className="btn secondary"
            onClick={() =>
              void signOut({ redirectUrl: `${window.location.origin}${base}Account` })
            }
            data-testid="button-customer-sign-out"
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="account-trust-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>Private to your Chenetha account</span>
      </div>
    </section>
  );
}

function SignedOutAccount() {
  return (
    <section className="account-welcome account-welcome-guest" data-testid="panel-signed-out-account">
      <div className="account-welcome-mark" aria-hidden="true"><UserRound size={24} /></div>
      <div className="account-welcome-copy">
        <span className="eyebrow">A place for your favourites</span>
        <h2>Your account, whenever you need it.</h2>
        <p className="account-checkout-note">
          Sign in to sync your saved preferences with Chenetha, or continue as a guest.
          Your guest preferences stay in this browser.
        </p>
        <div className="account-actions">
        <a
          className="btn"
          href={base + "sign-in?redirect_url=%2FAccount"}
          data-testid="link-customer-sign-in"
        >
          Sign in
        </a>
        <a
          className="btn secondary"
          href={base + "sign-up?redirect_url=%2FAccount"}
          data-testid="link-customer-sign-up"
        >
          Create account
        </a>
      </div>
        <p className="account-recovery-note">
          Forgot your password? Choose “Forgot password” on the sign-in page.
        </p>
      </div>
      <div className="account-trust-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>Your preferences are not shared with other shoppers</span>
      </div>
    </section>
  );
}

const accountLinks = [
  {
    href: "Profile",
    icon: UserRound,
    title: "Personal details",
    detail: "Contact details and saved addresses",
    testId: "link-account-profile",
  },
  {
    href: "Wishlist",
    icon: Heart,
    title: "Your wishlist",
    detail: "Return to the pieces you have saved",
    testId: "link-account-wishlist",
  },
  {
    href: "Cart",
    icon: ShoppingBag,
    title: "Your bag",
    detail: "Your bag is saved in this browser",
    testId: "link-account-cart",
  },
  {
    href: "Orders",
    icon: PackageCheck,
    title: "Order updates",
    detail: "Check order status with Shopify",
    testId: "link-account-orders",
  },
];

export function Account() {
  return (
    <Shell>
      <PageHero
        eyebrow="CHENETHA BY KOUSHIKII · YOUR ACCOUNT"
        title="A familiar place to return to."
        subtitle="Keep your favourite weaves close, with a little clarity about what lives where."
      />
      <main className="wrap content account-page">
        <div className="account-main">
          <Show when="signed-in">
            <SignedInAccount />
          </Show>
          <Show when="signed-out">
            <SignedOutAccount />
          </Show>
        </div>
        <section className="account-shortcuts" aria-labelledby="account-shortcuts-title">
          <div className="account-section-heading">
            <div>
              <span className="eyebrow">The essentials</span>
              <h2 id="account-shortcuts-title">Where would you like to go?</h2>
            </div>
            <span className="account-section-aside">Your account, at your pace.</span>
          </div>
          <nav className="account-link-grid" aria-label="Account destinations">
            {accountLinks.map(({ href, icon: Icon, title, detail, testId }, index) => (
              <a className="account-link-card" href={base + href} key={href} data-testid={testId}>
                <span className="account-link-index">0{index + 1}</span>
                <span className="account-link-icon"><Icon size={19} aria-hidden="true" /></span>
                <span className="account-link-copy">
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowUpRight className="account-link-arrow" size={17} aria-hidden="true" />
              </a>
            ))}
          </nav>
        </section>
        <section className="account-boundaries" aria-label="Account and order privacy">
          <div className="account-boundary-intro">
            <span className="eyebrow">A clear distinction</span>
            <h2>Two places, each with its own purpose.</h2>
          </div>
          <div className="account-boundary-detail">
            <span className="account-boundary-symbol" aria-hidden="true"><ShieldCheck size={18} /></span>
            <div>
              <h3>Chenetha account</h3>
              <p>Signed-in preferences sync with your Chenetha account. Guest preferences stay in this browser.</p>
            </div>
          </div>
          <div className="account-boundary-detail">
            <span className="account-boundary-symbol" aria-hidden="true"><PackageCheck size={18} /></span>
            <div>
              <h3>Shopify orders</h3>
              <p>Shopify handles checkout, payments, shipping and order updates. Order history is not linked to your Chenetha sign-in.</p>
              <a href={base + "Orders"}>Visit order updates <ArrowRight size={13} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="account-boundary-detail">
            <span className="account-boundary-symbol" aria-hidden="true"><ShoppingBag size={18} /></span>
            <div>
              <h3>Your bag</h3>
              <p>Your bag remains saved locally in this browser.</p>
            </div>
          </div>
        </section>
        <div className="account-help-line">
          <MapPin size={17} aria-hidden="true" />
          <p>Need a hand with a weave or your account?</p>
          <a href={base + "CustomerCare"}>Visit customer care <ArrowRight size={13} aria-hidden="true" /></a>
        </div>
      </main>
    </Shell>
  );
}
