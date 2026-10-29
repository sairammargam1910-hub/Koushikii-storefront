import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  getGetShopifyAdminProductsQueryKey,
  getGetShopifyProductsQueryKey,
  getGetShopifyAdminDiscountsQueryKey,
  useGetShopifyAdminProducts,
  useCreateShopifyAdminProduct,
  useUpdateShopifyAdminProduct,
  useArchiveShopifyAdminProduct,
  useGetShopifyAdminDiscounts,
  useCreateShopifyAdminDiscount,
  useDeactivateShopifyAdminDiscount,
  type ShopifyAdminProduct,
  type ShopifyAdminDiscount,
} from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import {
  ArrowDownRight, ArrowRight, BadgePercent, Box, Check, CircleAlert,
  Clock3, ExternalLink, Layers3, LoaderCircle, PackagePlus, Plus, RefreshCw,
  Search, Tag, X,
} from "lucide-react";
import "./Admin.css";

type ProductDraft = {
  title: string;
  description: string;
  productType: string;
  tags: string;
  price: string;
  inventoryQuantity: string;
  imageUrl: string;
  publishToWebsite: boolean;
};

const blankProduct: ProductDraft = {
  title: "", description: "", productType: "Saree", tags: "", price: "",
  inventoryQuantity: "1", imageUrl: "", publishToWebsite: true,
};

function currency(value: string | number, code?: string) {
  if (!code) return String(value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(Number(value));
  } catch {
    return `${value} ${code}`.trim();
  }
}

function formatDate(value: string | null) {
  if (!value) return "No end date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not scheduled" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error
    ? error.message.replace(/^HTTP \d+ [^:]*:\s*/, "")
    : fallback;
}

function AdminLayout({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow: string; action?: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  return <div className="merchant-app">
    <aside className="merchant-sidebar">
      <Link href="/admin" className="merchant-brand" data-testid="link-admin-brand">
        <span className="brand-seal">C</span><span><b>Chenetha</b><small>by Koushikii</small></span>
      </Link>
      <div className="sidebar-caption">YOUR WORKROOM</div>
      <nav className="merchant-nav" aria-label="Merchant navigation">
        <Link href="/admin" className={location === "/admin" ? "nav-item active" : "nav-item"} data-testid="link-admin-dashboard">
          <Layers3 size={18}/><span>Overview</span>
        </Link>
        <Link href="/admin/products" className={location === "/admin/products" ? "nav-item active" : "nav-item"} data-testid="link-admin-products">
          <Box size={18}/><span>Products</span>
        </Link>
        <Link href="/admin/discounts" className={location === "/admin/discounts" ? "nav-item active" : "nav-item"} data-testid="link-admin-discounts">
          <BadgePercent size={18}/><span>Discounts</span>
        </Link>
      </nav>
      <div className="sidebar-note">
        <span className="note-mark"><Check size={15}/></span>
        <b>Your catalog, in step</b>
        <p>Changes here are kept in sync with your Shopify store.</p>
      </div>
      <a className="storefront-link" href="/" data-testid="link-view-storefront"><ExternalLink size={15}/> View storefront</a>
    </aside>
    <main className="merchant-main">
      <header className="merchant-topbar">
        <span className="topbar-label"><span className="status-dot"/> SHOPIFY WORKSPACE</span>
        <div className="topbar-right"><span className="merchant-name">Merchant workspace</span><button className="merchant-signout" onClick={() => void signOut({ redirectUrl: "/" })} data-testid="button-merchant-sign-out">Sign out</button></div>
      </header>
      <section className="merchant-content">
        <div className="page-heading">
          <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>
          {action}
        </div>
        {children}
      </section>
      <footer className="merchant-footer"><span>Chenetha by Koushikii</span><span>Thoughtfully managed, beautifully woven.</span></footer>
    </main>
  </div>;
}

function LoadingPanel() {
  return <div className="admin-loading" aria-label="Loading"><span/><span/><span/></div>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="admin-state admin-error" data-testid="status-admin-error">
    <span className="state-icon"><CircleAlert size={20}/></span><div><b>We couldn’t load this just now.</b><p>{message}</p></div>
    <button className="button button-quiet" onClick={retry} data-testid="button-retry"><RefreshCw size={15}/> Try again</button>
  </div>;
}

function ProductModal({ initial, onClose, onSave, busy, error, allowVariantEdits, currencyCode }: {
  initial: ProductDraft; onClose: () => void; onSave: (draft: ProductDraft) => void; busy: boolean; error?: string;
  allowVariantEdits: boolean; currencyCode?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (key: keyof ProductDraft, value: string | boolean) => setDraft((old) => ({ ...old, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(draft); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <header className="modal-head"><div><span className="eyebrow">CATALOG DETAILS</span><h2 id="product-modal-title">{initial.title ? "Edit product" : "Add a product"}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close" data-testid="button-close-product-form"><X size={18}/></button></header>
      <form onSubmit={submit} className="admin-form">
        <label>Product name<input required maxLength={255} value={draft.title} onChange={(e) => change("title", e.target.value)} placeholder="e.g. Kanchipuram silk in marigold" data-testid="input-product-title"/></label>
        <div className="form-row">
          <label>Price{currencyCode ? ` (${currencyCode})` : ""}<input type="number" min="0.01" step="0.01" required={allowVariantEdits} disabled={!allowVariantEdits} value={draft.price} onChange={(e) => change("price", e.target.value)} placeholder="0.00" data-testid="input-product-price"/></label>
          <label>Available pieces<input type="number" min="0" step="1" required={allowVariantEdits} disabled={!allowVariantEdits} value={draft.inventoryQuantity} onChange={(e) => change("inventoryQuantity", e.target.value)} data-testid="input-product-inventory"/></label>
        </div>
        {!allowVariantEdits && <p className="field-note">This product has multiple variants. Price and stock are managed in Shopify; you can still update the shared product details here.</p>}
        <label>Weave / product type<input maxLength={100} value={draft.productType} onChange={(e) => change("productType", e.target.value)} placeholder="Saree" data-testid="input-product-type"/></label>
        <label>Short description<textarea maxLength={10000} rows={3} value={draft.description} onChange={(e) => change("description", e.target.value)} placeholder="What makes this piece special?" data-testid="input-product-description"/></label>
        <label>Tags <span className="label-hint">Separate with commas</span><input value={draft.tags} onChange={(e) => change("tags", e.target.value)} placeholder="silk, festive, handwoven" data-testid="input-product-tags"/></label>
        <label>{initial.title ? "Add another image URL" : "Image URL"} <span className="label-hint">Public HTTPS URL; existing images stay</span><input type="url" value={draft.imageUrl} onChange={(e) => change("imageUrl", e.target.value)} placeholder="https://…" data-testid="input-product-image-url"/></label>
        <label className="check-line"><input type="checkbox" checked={draft.publishToWebsite} onChange={(e) => change("publishToWebsite", e.target.checked)} data-testid="input-product-publish"/><span><b>Publish to website</b><small>Publishes this item to the Replit sales channel.</small></span></label>
        {error && <p className="form-error" role="alert" data-testid="text-product-form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-product">Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy} data-testid="button-save-product">{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {busy ? "Saving…" : "Save product"}</button></div>
      </form>
    </section>
  </div>;
}

function ProductForm({ product, onClose, currencyCode }: { product?: ShopifyAdminProduct; onClose: () => void; currencyCode?: string }) {
  const queryClient = useQueryClient();
  const create = useCreateShopifyAdminProduct();
  const update = useUpdateShopifyAdminProduct();
  const [error, setError] = useState("");
  const draft: ProductDraft = product ? {
    title: product.title, description: product.description || "", productType: product.productType || "",
    tags: product.tags.join(", "), price: product.variants[0]?.price || "", inventoryQuantity: String(product.variants[0]?.inventoryQuantity ?? 0),
    imageUrl: "", publishToWebsite: product.status === "ACTIVE",
  } : blankProduct;
  const busy = create.isPending || update.isPending;
  const save = (values: ProductDraft) => {
    setError("");
    const input = {
      title: values.title.trim(), description: values.description, productType: values.productType.trim(),
      tags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      ...(product
        ? {
            ...(product.variants.length === 1 && Number(values.price) !== Number(product.variants[0].price) ? { price: Number(values.price) } : {}),
            ...(product.variants.length === 1 && (Number(values.inventoryQuantity) !== product.variants[0].inventoryQuantity || !product.variants[0].inventoryTracked) ? { inventoryQuantity: Number(values.inventoryQuantity) } : {}),
          }
        : { price: Number(values.price), inventoryQuantity: Number(values.inventoryQuantity) }),
      ...(values.imageUrl.trim() ? { imageUrl: values.imageUrl.trim() } : {}),
      publishToWebsite: values.publishToWebsite,
    };
    const options = {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() }); onClose(); },
      onError: (reason: Error) => setError(reason.message || "Please check your details and try again."),
    };
    if (product) update.mutate({ productId: product.id, data: input }, options);
    else create.mutate({ data: { ...input, price: Number(values.price), inventoryQuantity: Number(values.inventoryQuantity) } }, options);
  };
  return <ProductModal initial={draft} onClose={onClose} onSave={save} busy={busy} error={error} allowVariantEdits={!product || product.variants.length === 1} currencyCode={currencyCode}/>;
}

export function AdminDashboard() {
  const products = useGetShopifyAdminProducts();
  const discounts = useGetShopifyAdminDiscounts();
  const [, setLocation] = useLocation();
  const productList = products.data?.products || [];
  const currencyCode = products.data?.currencyCode;
  const liveCount = productList.filter((product) => product.status === "ACTIVE").length;
  const activeDiscounts = discounts.data?.discounts.filter((discount) => discount.status === "ACTIVE").length ?? 0;
  return <AdminLayout title="Good day, Koushikii." eyebrow="YOUR WORKROOM · TODAY">
    <div className="welcome-banner"><div><span className="welcome-kicker">A little order in the everyday</span><h2>Your handloom business,<br/><em>at a glance.</em></h2><p>Keep your collection current and your offers ready to share.</p></div><div className="woven-stamp"><span>HAND</span><b>loom</b><span>IN INDIA</span></div></div>
    <div className="discount-intro"><div><b>Everyday updates here. Store setup in Shopify.</b><p>Manage products and offers in this workroom. Payment providers, shipping rates, fulfillment locations and order shipping are managed in Shopify. Go to Settings → Payments or Settings → Shipping and delivery.</p><a href="https://admin.shopify.com/" target="_blank" rel="noreferrer" className="text-link" data-testid="link-shopify-settings">Open Shopify admin <ExternalLink size={14}/></a></div></div>
    {(products.isLoading || discounts.isLoading) ? <LoadingPanel/> : products.isError || discounts.isError ?
      <ErrorPanel message={readableError(products.error || discounts.error, "Your Shopify workspace may be momentarily unavailable.")} retry={() => { void products.refetch(); void discounts.refetch(); }}/> :
      <>
        <div className="overview-grid">
          <article className="overview-stat"><span className="stat-label">LIVE IN YOUR STORE</span><div className="stat-value" data-testid="text-live-products">{liveCount}<span> / {productList.length} products</span></div><Link href="/admin/products" className="stat-link" data-testid="link-manage-products">Manage collection <ArrowRight size={15}/></Link></article>
          <article className="overview-stat accent-stat"><span className="stat-label">OFFERS RUNNING</span><div className="stat-value" data-testid="text-active-discounts">{activeDiscounts}<span> active codes</span></div><Link href="/admin/discounts" className="stat-link" data-testid="link-manage-discounts">Manage discounts <ArrowRight size={15}/></Link></article>
          <article className="overview-tip"><span className="tip-icon"><ArrowDownRight size={19}/></span><div><b>Small update, big difference</b><p>Fresh product photos help shoppers see the detail in every weave.</p></div></article>
        </div>
        <div className="section-heading"><div><span className="eyebrow">RECENTLY IN YOUR COLLECTION</span><h2>Products to keep an eye on</h2></div><Link href="/admin/products" className="text-link" data-testid="link-all-products">All products <ArrowRight size={15}/></Link></div>
        {productList.length ? <div className="recent-list">{productList.slice(0, 4).map((product) => <ProductRow key={product.id} product={product} currencyCode={currencyCode} compact/>)}</div> :
          <EmptyPanel icon={<Box size={21}/>} title="Your collection is ready for its first piece" body="Add a product to start building your live handloom catalog." action={<button className="button button-primary" onClick={() => setLocation("/admin/products?create=1")} data-testid="button-add-first-product"><Plus size={16}/> Add your first product</button>}/>}
      </>
    }
  </AdminLayout>;
}

function ProductRow({ product, currencyCode, compact, onEdit, onArchive }: {
  product: ShopifyAdminProduct; currencyCode?: string; compact?: boolean; onEdit?: () => void; onArchive?: () => void;
}) {
  const price = product.variants[0]?.price ?? "—";
  return <article className="product-row" data-testid={`row-product-${product.id}`}>
    <div className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy"/> : <span><Tag size={20}/></span>}</div>
    <div className="product-info"><b data-testid={`text-product-title-${product.id}`}>{product.title}</b><small>{product.productType || "Handloom"}{product.tags.length ? ` · ${product.tags.slice(0, 2).join(", ")}` : ""}</small></div>
    <div className="product-price" data-testid={`text-product-price-${product.id}`}>{currency(price, currencyCode)}</div>
    <StatusPill status={product.status} productId={product.id}/>
    {!compact && <div className="row-actions">{product.status !== "ARCHIVED" && <><button className="text-button" onClick={onEdit} data-testid={`button-edit-product-${product.id}`}>Edit</button><button className="text-button danger-text" onClick={onArchive} data-testid={`button-archive-product-${product.id}`}>Archive</button></>}</div>}
  </article>;
}

function StatusPill({ status, productId }: { status: string; productId: string }) {
  return <span className={`status-pill status-${status.toLowerCase()}`} data-testid={`status-product-${productId}`}>{status === "ACTIVE" ? "Live" : status === "DRAFT" ? "Draft" : status === "ARCHIVED" ? "Archived" : status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

function EmptyPanel({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-panel" data-testid="panel-empty"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

export function AdminProducts() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ShopifyAdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const products = useGetShopifyAdminProducts();
  const archive = useArchiveShopifyAdminProduct();
  const rows = useMemo(() => (products.data?.products || []).filter((product) => `${product.title} ${product.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())), [products.data?.products, search]);
  const createRequested = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("create") === "1";
  const onArchive = (product: ShopifyAdminProduct) => {
    if (!window.confirm(`Archive “${product.title}”? It will be hidden from the storefront, but not permanently deleted.`)) return;
    setNotice("");
    archive.mutate({ productId: product.id }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() }); setNotice(`${product.title} was archived.`); },
      onError: (error: Error) => setNotice(error.message || "Could not archive this product. Please try again."),
    });
  };
  return <AdminLayout title="Your products" eyebrow="SHOPIFY CATALOG" action={<button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-product"><Plus size={17}/> Add product</button>}>
    <div className="catalog-toolbar"><div className="toolbar-count"><b>{products.data?.products.length ?? "—"}</b> products in your catalog</div><label className="search-field"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product" aria-label="Find a product" data-testid="input-search-products"/></label></div>
    {notice && <div className={`inline-notice ${notice.includes("Could not") ? "notice-error" : ""}`} role="status" data-testid="status-product-notice"><Check size={16}/>{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")} data-testid="button-dismiss-notice"><X size={15}/></button></div>}
    {products.isLoading ? <LoadingPanel/> : products.isError ? <ErrorPanel message={readableError(products.error, "We couldn’t reach your Shopify catalog.")} retry={() => void products.refetch()}/> :
      rows.length ? <div className="catalog-table"><div className="table-head"><span>PRODUCT</span><span>PRICE</span><span>STATUS</span><span>ACTIONS</span></div>{rows.map((product) => <ProductRow key={product.id} product={product} currencyCode={products.data?.currencyCode} onEdit={() => setEditing(product)} onArchive={() => onArchive(product)}/>)}</div> :
        <EmptyPanel icon={<PackagePlus size={22}/>} title={search ? "No matching products" : "Your catalog is still unwoven"} body={search ? "Try another name or tag." : "Add your first saree and keep its price, stock and story together."} action={!search ? <button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-empty-create-product"><Plus size={16}/> Add a product</button> : undefined}/>
    }
    {(creating || createRequested) && <ProductForm onClose={() => { setCreating(false); if (createRequested) window.history.replaceState({}, "", "/admin/products"); }} currencyCode={products.data?.currencyCode}/>}
    {editing && <ProductForm product={editing} onClose={() => setEditing(null)} currencyCode={products.data?.currencyCode}/>}
  </AdminLayout>;
}

type DiscountInput = { title: string; code: string; percentage: number; startsAt?: string; endsAt?: string | null; usageLimit?: number; appliesOncePerCustomer: boolean };

function DiscountModal({ onClose, onSubmit, busy, error }: { onClose: () => void; onSubmit: (data: DiscountInput) => void; busy: boolean; error: string }) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [percentage, setPercentage] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [once, setOnce] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ title: title.trim(), code: code.trim().toUpperCase(), percentage: Number(percentage), ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}), ...(usageLimit ? { usageLimit: Number(usageLimit) } : {}), appliesOncePerCustomer: once }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="discount-modal-title">
      <header className="modal-head"><div><span className="eyebrow">A SMALL THANK-YOU</span><h2 id="discount-modal-title">Create a discount</h2></div><button className="icon-button" onClick={onClose} aria-label="Close" data-testid="button-close-discount-form"><X size={18}/></button></header>
      <form className="admin-form" onSubmit={submit}>
        <label>Offer name<input required maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Festive season thank-you" data-testid="input-discount-title"/></label>
        <div className="form-row"><label>Discount code<input required maxLength={64} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WEAVE15" data-testid="input-discount-code"/></label>
          <label>Percent off<input required type="number" min="0.01" max="100" step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="15" data-testid="input-discount-percentage"/></label></div>
        <div className="form-row"><label>Starts (optional)<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} data-testid="input-discount-start"/></label><label>Ends (optional)<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} data-testid="input-discount-end"/></label></div>
        <label>Usage limit <span className="label-hint">Leave empty for no limit</span><input type="number" min="1" step="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="No limit" data-testid="input-discount-limit"/></label>
        <label className="check-line"><input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} data-testid="input-discount-once"/><span><b>Once per customer</b><small>Each customer may use this code one time.</small></span></label>
        {error && <p className="form-error" role="alert" data-testid="text-discount-form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-discount">Cancel</button><button type="submit" className="button button-primary" disabled={busy} data-testid="button-save-discount">{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} {busy ? "Creating…" : "Create code"}</button></div>
      </form>
    </section>
  </div>;
}

function DiscountRow({ discount, onDeactivate, busy }: { discount: ShopifyAdminDiscount; onDeactivate: () => void; busy: boolean }) {
  const label = discount.status.toLowerCase();
  return <article className="discount-row" data-testid={`row-discount-${discount.id}`}>
    <div className="discount-mark"><BadgePercent size={19}/></div><div className="discount-info"><b>{discount.title}</b><span className="discount-code" data-testid={`text-discount-code-${discount.id}`}>{discount.code}</span></div>
    <div className="discount-rate" data-testid={`text-discount-percentage-${discount.id}`}>{discount.percentage}% <small>off</small></div>
    <span className={`status-pill status-${label}`} data-testid={`status-discount-${discount.id}`}>{discount.status.charAt(0) + discount.status.slice(1).toLowerCase()}</span>
    <div className="discount-end"><Clock3 size={14}/>{formatDate(discount.endsAt)}</div>
    {discount.status !== "EXPIRED" && <button className="text-button danger-text" disabled={busy} onClick={onDeactivate} data-testid={`button-deactivate-discount-${discount.id}`}>{busy ? "Deactivating…" : "Deactivate"}</button>}
  </article>;
}

export function AdminDiscounts() {
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const discounts = useGetShopifyAdminDiscounts();
  const create = useCreateShopifyAdminDiscount();
  const deactivate = useDeactivateShopifyAdminDiscount();
  const list = discounts.data?.discounts || [];
  const createDiscount = (data: DiscountInput) => {
    setFormError("");
    create.mutate({ data }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminDiscountsQueryKey() }); setCreating(false); setNotice("Your new discount code is ready."); },
      onError: (error: Error) => setFormError(error.message || "Could not create this discount. Please check the details."),
    });
  };
  const deactivateDiscount = (discount: ShopifyAdminDiscount) => {
    if (!window.confirm(`Deactivate ${discount.code}? Customers will no longer be able to use it.`)) return;
    deactivate.mutate({ discountId: discount.id }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminDiscountsQueryKey() }); setNotice(`${discount.code} has been deactivated.`); },
      onError: (error: Error) => setNotice(error.message || "Could not deactivate this code. Please try again."),
    });
  };
  const active = list.filter((discount) => discount.status === "ACTIVE");
  const other = list.filter((discount) => discount.status !== "ACTIVE");
  return <AdminLayout title="Offers & discounts" eyebrow="SALES PROMOTIONS" action={<button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-discount"><Plus size={17}/> Create discount</button>}>
    <div className="discount-intro"><span className="discount-intro-icon"><BadgePercent size={20}/></span><p>Make a little room for a thank-you. Your percentage codes are created in Shopify and ready for customers at checkout.</p></div>
    {notice && <div className={`inline-notice ${notice.startsWith("Could not") ? "notice-error" : ""}`} role="status" data-testid="status-discount-notice"><Check size={16}/>{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")} data-testid="button-dismiss-discount-notice"><X size={15}/></button></div>}
    {discounts.isLoading ? <LoadingPanel/> : discounts.isError ? <ErrorPanel message={readableError(discounts.error, "We couldn’t reach your Shopify discounts.")} retry={() => void discounts.refetch()}/> :
      list.length ? <div className="discount-sections">
        {active.length > 0 && <section><div className="section-heading slim-heading"><div><span className="eyebrow">READY TO USE</span><h2>Active codes <span className="heading-count">{active.length}</span></h2></div></div><div className="discount-list">{active.map((discount) => <DiscountRow key={discount.id} discount={discount} busy={deactivate.isPending} onDeactivate={() => deactivateDiscount(discount)}/>)}</div></section>}
        {other.length > 0 && <section><div className="section-heading slim-heading"><div><span className="eyebrow">PAST & UPCOMING</span><h2>Other codes <span className="heading-count">{other.length}</span></h2></div></div><div className="discount-list subdued-list">{other.map((discount) => <DiscountRow key={discount.id} discount={discount} busy={deactivate.isPending} onDeactivate={() => deactivateDiscount(discount)}/>)}</div></section>}
      </div> : <EmptyPanel icon={<BadgePercent size={22}/>} title="No codes just yet" body="Create a percentage code for a festive moment, a returning customer, or a little thank-you." action={<button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-empty-create-discount"><Plus size={16}/> Create first code</button>}/>
    }
    {creating && <DiscountModal onClose={() => setCreating(false)} onSubmit={createDiscount} busy={create.isPending} error={formError}/>}
  </AdminLayout>;
}

export function AdminSignInPrompt() {
  return <div className="auth-gate"><div className="auth-gate-card"><span className="brand-seal">C</span><span className="eyebrow">MERCHANT WORKROOM</span><h1>Welcome back.</h1><p>Sign in to tend your collection and offers.</p><Link href="/sign-in" className="button button-primary" data-testid="link-admin-sign-in">Sign in to continue <ArrowRight size={16}/></Link><small>Your shoppers will never see this workspace.</small></div></div>;
}

