import { Shell, PageHero, base } from "./_shared";

function SignedOutAccount() {
  return (
    <section className="panel account-auth-panel" data-testid="panel-signed-out-account">
      <span className="eyebrow">Your account</span>
      <h2 style={{ fontSize: 34, margin: "16px 0 8px" }}>
        A familiar place to return to.
      </h2>
      <p className="muted">
        Sign in with your email and password, or create an account to return to
        your saved preferences.
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
      <p className="muted account-recovery-note">
        Forgot your password? Choose “Forgot password” on the sign-in page.
        After resetting it, sign in to return to your account.
      </p>
    </section>
  );
}

export function AccountCurrent() {
  return (
    <Shell>
      <PageHero
        eyebrow="Your corner · Account"
        title="A familiar place to return to."
        subtitle="Sign in to your Chenetha account or create one."
      />
      <main className="wrap content">
        <div className="two-col">
          <SignedOutAccount />
          <aside className="panel">
            <span className="eyebrow">Account resources</span>
            <h3 style={{ margin: "16px 0" }}>A place for the pieces you love.</h3>
            <p className="muted">
              Your wishlist and profile preferences sync with your signed-in account.
              Guest preferences stay in this browser, and your bag remains browser-local.
            </p>
            <nav className="support-links" aria-label="Account resources">
              <a href={base + "Wishlist"}>Your wishlist →</a>
              <a href={base + "Cart"}>Your bag →</a>
              <a href={base + "CustomerCare"}>Customer care →</a>
            </nav>
          </aside>
        </div>
      </main>
    </Shell>
  );
}
