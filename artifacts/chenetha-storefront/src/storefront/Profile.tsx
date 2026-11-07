import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import {
  useShopperPreferences,
  type ShopperProfileData,
} from "./ShopperPreferences";
import type { ShopperAddress } from "@workspace/api-client-react";

type Details = Pick<ShopperProfileData, "name" | "email" | "phone">;
const initialDetails: Details = { name: "", email: "", phone: "" };
const blankAddress: ShopperAddress = {
  id: "",
  label: "Home",
  recipient: "",
  street: "",
  city: "",
  state: "",
  pin: "",
};

export function Profile() {
  const {
    signedIn,
    loading,
    error,
    profile,
    saveProfile,
    clearAll,
    retry,
  } = useShopperPreferences();
  const [details, setDetails] = useState<Details>(initialDetails);
  const [draft, setDraft] = useState<Details>(initialDetails);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [addresses, setAddresses] = useState<ShopperAddress[]>([]);
  const [address, setAddress] = useState<ShopperAddress | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const unavailable = loading || (signedIn && Boolean(error));

  useEffect(() => {
    if (editing) return;
    const nextDetails = {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
    };
    setDetails(nextDetails);
    setDraft(nextDetails);
    setAddresses(profile.addresses);
  }, [editing, profile]);

  async function persistProfile(
    next: ShopperProfileData,
    successMessage: string,
  ): Promise<boolean> {
    setFeedback("");
    try {
      await saveProfile(next);
      setDetails({ name: next.name, email: next.email, phone: next.phone });
      setAddresses(next.addresses);
      setFeedback(successMessage);
      return true;
    } catch {
      setFeedback("Your preferences could not be saved. Please try again.");
      return false;
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await persistProfile(
      { ...profile, ...draft },
      signedIn
        ? "Saved to your Chenetha account and available on your devices."
        : "Saved on this device only.",
    );
    if (saved) setEditing(false);
  }

  async function removeAddress(id: string) {
    const next = addresses.filter((item) => item.id !== id);
    const saved = await persistProfile(
      { ...profile, addresses: next },
      signedIn ? "Saved address removed from your account." : "Saved address removed from this device.",
    );
    if (saved) {
      setDeleting(null);
      if (address?.id === id) setAddress(null);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    const saved = { ...address, id: address.id || crypto.randomUUID() };
    const nextAddresses = address.id
      ? addresses.map((item) => (item.id === address.id ? saved : item))
      : [...addresses, saved];
    const savedSuccessfully = await persistProfile(
      { ...profile, addresses: nextAddresses },
      signedIn ? "Address saved to your account." : "Address saved on this device only.",
    );
    if (savedSuccessfully) setAddress(null);
  }

  async function clearPreferences() {
    setFeedback("");
    try {
      await clearAll();
      setDetails(initialDetails);
      setDraft(initialDetails);
      setAddresses([]);
      setAddress(null);
      setEditing(false);
      setConfirmClear(false);
      setFeedback(
        signedIn
          ? "Your saved account preferences have been cleared."
          : "Your saved preferences have been cleared from this device.",
      );
    } catch {
      setFeedback("Your saved preferences could not be cleared. Please try again.");
    }
  }

  return (
    <Shell>
      <PageHero
        eyebrow={signedIn ? "Saved preferences · Your account" : "Saved preferences · This browser"}
        title="Welcome home, to your weaves."
        subtitle={
          signedIn
            ? "Your wishlist, contact details and saved addresses follow your account across devices."
            : "Browse as a guest, or sign in to keep your wishlist and saved preferences across devices."
        }
      />
      <main className="wrap content">
        {loading && (
          <div className="notice" role="status">Loading your saved preferences…</div>
        )}
        {error && signedIn && (
          <div className="notice" role="alert">
            <p>Your account preferences could not be loaded. Your saved data has not been changed.</p>
            <button className="btn small outline" onClick={() => void retry()}>
              Try again
            </button>
          </div>
        )}
        {feedback && <div className="notice profile-feedback" role="status">{feedback}</div>}
        <div className="profile-layout">
          <aside className="profile-card">
            <div className="profile-monogram" aria-hidden="true">
              {details.name.trim()
                ? details.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
                : "CK"}
            </div>
            <span className="eyebrow">{signedIn ? "Saved to your account" : "Saved locally"}</span>
            <h2>{details.name || "Your details"}</h2>
            <p style={{ fontSize: 12, overflowWrap: "anywhere" }}>
              {details.email || "No email saved"}
            </p>
            <nav className="profile-nav" aria-label="Your saved preferences">
              <a href="#personal-details">Personal details</a>
              <a href="#saved-addresses">Saved addresses</a>
              <a href={base + "Orders"}>Order information →</a>
              <a href={base + "Wishlist"}>Your wishlist →</a>
              <a href={base + "CustomerCare"}>Customer care →</a>
            </nav>
            <a className="btn gold" href={base + "Account"}>Account information</a>
            <p style={{ fontSize: 10 }}>
              {signedIn
                ? "These preferences are private to your signed-in account and can prefill delivery details at Chenetha checkout."
                : "Guest preferences stay in this browser and can prefill delivery details at Chenetha checkout."}
            </p>
          </aside>
          <div>
            <section className="panel profile-section" id="personal-details">
              <div className="section-head">
                <div>
                  <span className="eyebrow">01 / The small details</span>
                  <h2 style={{ marginTop: 10 }}>Personal details</h2>
                </div>
                {!editing && (
                  <button
                    className="btn small outline"
                    disabled={unavailable}
                    onClick={() => {
                      setDraft(details);
                      setEditing(true);
                      setFeedback("");
                    }}
                  >
                    <Pencil size={13} />Edit details
                  </button>
                )}
              </div>
              {editing ? (
                <form className="form" onSubmit={saveDetails}>
                  <div className="field">
                    <label htmlFor="profile-name">Name (optional)</label>
                    <input
                      id="profile-name"
                      maxLength={80}
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </div>
                  <div className="cols">
                    <div className="field">
                      <label htmlFor="profile-email">Email (optional)</label>
                      <input
                        id="profile-email"
                        type="email"
                        maxLength={254}
                        value={draft.email}
                        onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="profile-phone">Phone (optional)</label>
                      <input
                        id="profile-phone"
                        type="tel"
                        maxLength={40}
                        value={draft.phone}
                        onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                      />
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn small" disabled={unavailable}>Save details</button>
                    <button
                      type="button"
                      className="btn small outline"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl>
                  <dt className="eyebrow">Name</dt>
                  <dd style={{ margin: "8px 0 24px" }}>{details.name || "Not saved"}</dd>
                  <dt className="eyebrow">Email</dt>
                  <dd style={{ margin: "8px 0 24px", overflowWrap: "anywhere" }}>
                    {details.email || "Not saved"}
                  </dd>
                  <dt className="eyebrow">Phone</dt>
                  <dd style={{ margin: "8px 0" }}>{details.phone || "Not saved"}</dd>
                </dl>
              )}
              <p className="muted" style={{ fontSize: 11 }}>
                {signedIn ? "Stored privately with your account." : "Stored locally in this browser."}
                {" "}It is sent to Shopify only when you choose to continue with saved details at checkout. This does not update a Shopify customer record.
              </p>
            </section>

            <section className="panel profile-section" id="saved-addresses">
              <div className="section-head">
                <div>
                  <span className="eyebrow">02 / A place to return to</span>
                  <h2 style={{ marginTop: 10 }}>Saved addresses</h2>
                </div>
                <button
                  className="btn small outline"
                  disabled={unavailable || addresses.length >= 20}
                  onClick={() => {
                    setAddress({ ...blankAddress });
                    setFeedback("");
                    setDeleting(null);
                  }}
                >
                  <Plus size={14} />Add address
                </button>
              </div>
              {addresses.length ? (
                <div className="address-list">
                  {addresses.map((item) => (
                    <article className="guide-note" key={item.id}>
                      <span className="eyebrow">{item.label}</span>
                      <h3 style={{ fontSize: 24, marginTop: 12 }}>{item.recipient}</h3>
                      <p>{item.street}{"\n"}{item.city}, {item.state}{"\n"}{item.pin}</p>
                      <div className="actions">
                        <button
                          className="btn small outline"
                          disabled={unavailable}
                          onClick={() => {
                            setAddress({ ...item });
                            setDeleting(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn small outline"
                          disabled={unavailable}
                          onClick={() => setDeleting(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                      {deleting === item.id && (
                        <div className="notice" style={{ marginTop: 15 }}>
                          <p>Remove this saved address? This cannot be undone.</p>
                          <div className="actions">
                            <button
                              className="btn small"
                              onClick={() => void removeAddress(item.id)}
                            >
                              Confirm delete
                            </button>
                            <button className="btn small outline" onClick={() => setDeleting(null)}>
                              Keep address
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="guide-note">
                  <h3>No addresses, yet.</h3>
                  <p className="muted">
                    Add a saved delivery address to prefill Chenetha checkout after you sign in. You can also enter an address directly before requesting a quote.
                  </p>
                </div>
              )}
              {address && (
                <form
                  className="form"
                  style={{ marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 24 }}
                  onSubmit={(event) => void saveAddress(event)}
                >
                  <h3>{address.id ? "Edit" : "Add"} a saved address</h3>
                  <p className="muted" style={{ fontSize: 11 }}>
                    {signedIn
                      ? "Saved privately with your account. It is sent to Shopify only when you choose saved details at checkout."
                      : "Saved locally in this browser. Sign in to save it to your account and prefill Chenetha checkout."}
                  </p>
                  {(
                    [
                      ["label", "Address label"],
                      ["recipient", "Recipient"],
                      ["street", "House, street & area"],
                      ["city", "City"],
                      ["state", "State"],
                      ["pin", "PIN code"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="field" key={key}>
                      <label htmlFor={"address-" + key}>{label}</label>
                      <input
                        id={"address-" + key}
                        required
                        maxLength={key === "pin" ? 12 : key === "street" ? 500 : 160}
                        pattern={key === "pin" ? "[1-9][0-9]{5}" : undefined}
                        inputMode={key === "pin" ? "numeric" : undefined}
                        value={address[key]}
                        onChange={(event) =>
                          setAddress({ ...address, [key]: event.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div className="actions">
                    <button className="btn small" disabled={unavailable}>Save address</button>
                    <button
                      type="button"
                      className="btn small outline"
                      onClick={() => setAddress(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="guide-note">
              <span className="eyebrow">A little help, close by</span>
              <h3 style={{ marginTop: 12 }}>From choosing to keeping.</h3>
              <p>Find guidance on choosing a textile, confirming purchase details and looking after a favourite saree.</p>
              <a className="link" href={base + "CustomerCare"}>
                Visit customer care <ArrowRight size={13} />
              </a>
            </section>
            <section className="panel profile-section" aria-label="Clear saved preferences">
              <h3>Clear saved preferences</h3>
              <p className="muted">
                {signedIn
                  ? "This clears the preferences saved to your account. Guest data stored separately in this browser remains available when you sign out."
                  : "This clears profile details, addresses and wishlist saved in this browser. Your bag is not affected."}
              </p>
              {!confirmClear ? (
                <button
                  className="btn small outline"
                  disabled={unavailable}
                  onClick={() => setConfirmClear(true)}
                >
                  {signedIn ? "Clear account preferences" : "Clear browser preferences"}
                </button>
              ) : (
                <div className="notice">
                  <p>
                    {signedIn
                      ? "Clear all preferences saved to your account? This cannot be undone."
                      : "Clear all preferences saved in this browser? This cannot be undone."}
                  </p>
                  <div className="actions">
                    <button className="btn small" onClick={() => void clearPreferences()}>
                      Confirm clear
                    </button>
                    <button
                      className="btn small outline"
                      onClick={() => setConfirmClear(false)}
                    >
                      Keep preferences
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
