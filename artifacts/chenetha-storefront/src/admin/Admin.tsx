import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  getGetShopifyAdminProductsQueryKey,
  getGetShopifyAdminCollectionsQueryKey,
  getGetShopifyAdminProductQueryKey,
  getGetShopifyAdminInventoryQueryKey,
  getGetShopifyProductsQueryKey,
  getGetShopifyAdminDiscountsQueryKey,
  useGetShopifyAdminInventory,
  useGetShopifyAdminProducts,
  useGetShopifyAdminCollections,
  useGetShopifyAdminProduct,
  useCreateShopifyAdminProduct,
  useUpdateShopifyAdminProduct,
  useArchiveShopifyAdminProduct,
  usePermanentlyDeleteShopifyAdminProduct,
  useGetShopifyAdminDiscounts,
  useCreateShopifyAdminDiscount,
  useDeactivateShopifyAdminDiscount,
  type ShopifyAdminProduct,
  type ShopifyAdminCollection,
  type ShopifyAdminInventoryVariant,
  type ShopifyAdminDiscount,
} from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import {
  ArrowDownRight, ArrowRight, BadgePercent, Box, Check, CircleAlert, Images,
  Clock3, ExternalLink, Layers3, LoaderCircle, MapPin, PackagePlus, Plus, RefreshCw,
  Search, Tag, X,
} from "lucide-react";
import "./Admin.css";
import { ProductPhotoPicker } from "./ProductPhotoPicker";
import { VariantEditor } from "./VariantEditor";
import {
  parseClassificationValues,
  serializeClassificationValues,
  REGIONAL_HANDLOOMS,
  WEAVE_PRINTS,
} from "../storefront/shopifyCatalogData";

type ProductDraft = {
  title: string;
  description: string;
  productType: string;
  tags: string;
  fabric: string[];
  regionalHandloom: string[];
  craftTechnique: string[];
  region: string[];
  colour: string[];
  collectionIds: string[];
  newCollectionTitle: string;
  price: string;
  weightKg: string;
  inventoryQuantity: string;
  imageUrl: string;
  publishToWebsite: boolean;
};

const blankProduct: ProductDraft = {
  title: "", description: "", productType: "", tags: "", fabric: [],
  regionalHandloom: [], craftTechnique: [], region: [], colour: [], collectionIds: [], newCollectionTitle: "", price: "", weightKg: "",
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

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error
    ? error.message.replace(/^HTTP \d+ [^:]*:\s*/, "")
    : fallback;
}

function productDeletionError(error: unknown) {
  const message = readableError(error, "");
  if (!message || /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)) {
    return "Shopify could not be reached. Check the connection and try again.";
  }
  return message;
}

export function AdminLayout({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow: string; action?: ReactNode }) {
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
        <Link href="/admin/content" className={location === "/admin/content" ? "nav-item active" : "nav-item"} data-testid="link-admin-content">
          <Images size={18}/><span>Storefront content</span>
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

const LOW_STOCK_THRESHOLD = 3;

type StockWatchRow = {
  key: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  inventoryPolicy: "DENY" | "CONTINUE";
  locationName?: string;
  quantity?: number;
  kind: "out" | "low" | "untracked" | "inactive" | "unassigned";
};

function stockWatchRows(variants: ShopifyAdminInventoryVariant[]): StockWatchRow[] {
  const rows: StockWatchRow[] = [];
  for (const variant of variants) {
    if (variant.productStatus === "ARCHIVED") continue;
    const variantTitle = variant.variantTitle === "Default Title" ? "Standard saree" : variant.variantTitle;
    if (!variant.tracked) {
      rows.push({ key: `${variant.variantId}:untracked`, productId: variant.productId, productTitle: variant.productTitle, variantTitle, inventoryPolicy: variant.inventoryPolicy, kind: "untracked" });
      continue;
    }
    if (!variant.locations.length) {
      rows.push({ key: `${variant.variantId}:unassigned`, productId: variant.productId, productTitle: variant.productTitle, variantTitle, inventoryPolicy: variant.inventoryPolicy, kind: "unassigned" });
      continue;
    }
    for (const level of variant.locations) {
      const base = {
        key: `${variant.variantId}:${level.locationId}`,
        productId: variant.productId,
        productTitle: variant.productTitle,
        variantTitle,
        inventoryPolicy: variant.inventoryPolicy,
        locationName: level.locationName,
        quantity: level.available,
      };
      if (!level.active) rows.push({ ...base, kind: "inactive" });
      else if (level.available === 0) rows.push({ ...base, kind: "out" });
      else if (level.available <= LOW_STOCK_THRESHOLD) rows.push({ ...base, kind: "low" });
    }
  }
  const priority = { out: 0, low: 1, untracked: 2, inactive: 3, unassigned: 4 };
  return rows.sort((a, b) => priority[a.kind] - priority[b.kind] || a.productTitle.localeCompare(b.productTitle));
}

function StockWatch() {
  const inventory = useGetShopifyAdminInventory({
    query: { queryKey: getGetShopifyAdminInventoryQueryKey(), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false },
  });
  const rows = inventory.data ? stockWatchRows(inventory.data.variants) : [];
  const outCount = rows.filter((row) => row.kind === "out").length;
  const lowCount = rows.filter((row) => row.kind === "low").length;
  const formatCheckedAt = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const rowLabel = (row: StockWatchRow) => {
    if (row.kind === "out") return row.inventoryPolicy === "CONTINUE" ? "0 available · Shopify still allows sales" : "Out of stock";
    if (row.kind === "low") return `Low stock · ${row.quantity} available`;
    if (row.kind === "untracked") return "Not tracked in Shopify";
    if (row.kind === "inactive") return `Inactive location · ${row.quantity} available`;
    return "No location assigned";
  };
  return <section className="stock-watch" aria-labelledby="stock-watch-title" data-testid="panel-stock-watch">
    <div className="stock-watch-heading">
      <div><span className="eyebrow">LOCATION-BY-LOCATION</span><h2 id="stock-watch-title">Stock to keep an eye on</h2>
        <p>Fresh Shopify available quantities. Low stock means 1–{LOW_STOCK_THRESHOLD} pieces; inactive and untracked inventory is not counted as empty.</p></div>
      <button className="button button-quiet" disabled={inventory.isFetching} onClick={() => void inventory.refetch()} data-testid="button-refresh-stock">
        <RefreshCw className={inventory.isFetching ? "spin" : ""} size={15}/>{inventory.isFetching ? "Refreshing…" : "Refresh stock"}
      </button>
    </div>
    {inventory.isLoading ? <div className="stock-watch-state" role="status">Loading current Shopify stock by location…</div> :
      inventory.isError ? <div className="stock-watch-error" role="alert"><CircleAlert size={17}/><span>{readableError(inventory.error, "Could not load current Shopify inventory.")}</span><button className="text-button" onClick={() => void inventory.refetch()}>Try again</button></div> :
      <>
        <div className="stock-watch-summary" aria-live="polite">
          <span className="stock-count stock-count-out"><b>{outCount}</b> out of stock</span>
          <span className="stock-count stock-count-low"><b>{lowCount}</b> low stock</span>
          <span className="stock-checked">Checked {formatCheckedAt(inventory.data!.refreshedAt)}</span>
        </div>
        {rows.length ? <ul className="stock-watch-list">
          {rows.slice(0, 10).map((row) => <li key={row.key} className={`stock-watch-row stock-watch-${row.kind}`}>
            <span className="stock-watch-marker"><MapPin size={15}/></span>
            <span className="stock-watch-item"><b>{row.productTitle}</b><small>{row.variantTitle}{row.locationName ? ` · ${row.locationName}` : ""}</small></span>
            <span className={`stock-watch-badge stock-badge-${row.kind}`}>{rowLabel(row)}</span>
          </li>)}
        </ul> : <div className="stock-watch-state">{inventory.data!.variants.length ? "No active locations are low or out of stock." : "No Shopify variants were found."}</div>}
        {rows.length > 10 && <p className="stock-watch-more">Showing 10 of {rows.length} stock notices. Open Products to review the full catalog.</p>}
        <div className="stock-watch-footer"><Link href="/admin/products" className="text-link" data-testid="link-stock-products">Review products and location stock <ArrowRight size={15}/></Link></div>
      </>}
  </section>;
}

function ClassificationField({
  label,
  field,
  values,
  suggestions,
  onChange,
  placeholder,
}: {
  label: string;
  field: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const listId = `classification-options-${field}`;
  const addValue = () => {
    const value = input.trim();
    if (!value) return;
    onChange([...new Set([...values, value])]);
    setInput("");
  };
  return <div className="classification-field">
    <label htmlFor={`classification-input-${field}`}>{label}</label>
    <div className="classification-entry">
      <input
        id={`classification-input-${field}`}
        list={listId}
        maxLength={100}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addValue();
          }
        }}
        placeholder={placeholder}
        aria-label={`${label} value`}
      />
      <datalist id={listId}>{suggestions.map((value) => <option key={value} value={value}/>)}</datalist>
      <button type="button" className="button button-quiet" onClick={addValue} disabled={!input.trim()} aria-label={`Add ${label} value`}><Plus size={15}/></button>
    </div>
    {values.length > 0 && <div className="classification-values" aria-label={`Selected ${label} values`}>
      {values.map((value) => <span className="classification-chip" key={value}>{value}<button type="button" aria-label={`Remove ${value} from ${label}`} onClick={() => onChange(values.filter((item) => item !== value))}><X size={13}/></button></span>)}
    </div>}
  </div>;
}

function ProductModal({ initial, onClose, onSave, busy, error, allowVariantEdits, currencyCode, existingImage, productId, collections, collectionsLoading, collectionsError, classificationSuggestions, productTypeSuggestions }: {
  initial: ProductDraft; onClose: () => void; onSave: (draft: ProductDraft) => void; busy: boolean; error?: string;
  allowVariantEdits: boolean; currencyCode?: string; existingImage?: string | null; productId?: string;
  collections: ShopifyAdminCollection[]; collectionsLoading: boolean; collectionsError?: string;
  classificationSuggestions: Record<"fabric" | "regionalHandloom" | "craftTechnique" | "region" | "colour", string[]>;
  productTypeSuggestions: string[];
}) {
  const [draft, setDraft] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const change = (key: keyof ProductDraft, value: string | string[] | boolean) => setDraft((old) => ({ ...old, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!busy && !uploading && !photoPending) onSave({ ...draft, imageUrl: photoUrl || draft.imageUrl }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !uploading) onClose(); }}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <header className="modal-head"><div><span className="eyebrow">CATALOG DETAILS</span><h2 id="product-modal-title">{initial.title ? "Edit product" : "Add a product"}</h2></div>
        <button className="icon-button" disabled={busy || uploading} onClick={onClose} aria-label="Close" data-testid="button-close-product-form"><X size={18}/></button></header>
      <form onSubmit={submit} className="admin-form">
        <label>Product name<input required maxLength={255} value={draft.title} onChange={(e) => change("title", e.target.value)} placeholder="e.g. Kanchipuram silk in marigold" data-testid="input-product-title"/></label>
        {allowVariantEdits && <div className="form-row">
          <label>Price{currencyCode ? ` (${currencyCode})` : ""}<input type="number" min="0.01" step="0.01" required={allowVariantEdits} disabled={!allowVariantEdits} value={draft.price} onChange={(e) => change("price", e.target.value)} placeholder="0.00" data-testid="input-product-price"/></label>
          <label>Available pieces<input type="number" min="0" step="1" required={allowVariantEdits} disabled={!allowVariantEdits} value={draft.inventoryQuantity} onChange={(e) => change("inventoryQuantity", e.target.value)} data-testid="input-product-inventory"/></label>
          <label>Weight per piece (kg)<input type="number" min="0.001" max="1000" step="0.001" required value={draft.weightKg} onChange={(e) => change("weightKg", e.target.value)} placeholder="e.g. 0.750" data-testid="input-product-weight"/></label>
          <p className="field-note">Used to calculate one combined parcel for the whole bag. Each size/color variant has its own weight in “Variants &amp; stock”.</p>
        </div>}
        {!allowVariantEdits && <p className="field-note">Edit prices, piece weights, size/color values and stock per location using “Variants &amp; stock” in the product list.</p>}
         <label>Product type<input list="shopify-product-type-options" maxLength={100} value={draft.productType} onChange={(e) => change("productType", e.target.value)} placeholder="Search or add a type…" data-testid="input-product-type"/><datalist id="shopify-product-type-options">{productTypeSuggestions.map((value)=><option key={value} value={value}/>)}</datalist></label>
        <label>Short description<textarea maxLength={10000} rows={3} value={draft.description} onChange={(e) => change("description", e.target.value)} placeholder="What makes this piece special?" data-testid="input-product-description"/></label>
         <label>Search tags <span className="label-hint">Use “new arrival” for New Arrivals. Tag premium items “premium” (or assign them to the Premium Collection). A premium item’s Shopify collection and Regional Handloom / Tradition categories appear in the green panel.</span><input value={draft.tags} onChange={(e) => change("tags", e.target.value)} placeholder="new arrival, premium, handwoven" data-testid="input-product-tags"/></label>
         <fieldset className="admin-product-attributes">
            <legend>Website categories &amp; filters</legend>
            <p className="field-note">Fabric creates a separate “Shop by Fabric” tile. Weave / Print Technique feeds “Shop by Weave.” Regional tradition, origin and colour help shoppers filter products. Add a value with +, then save.</p>
           <div className="form-row">
             <ClassificationField label="Fabric" field="fabric" values={draft.fabric} suggestions={classificationSuggestions.fabric} onChange={(values) => change("fabric", values)} placeholder="Search or add a fabric"/>
             <ClassificationField label="Regional Handloom / Tradition" field="regional-handloom" values={draft.regionalHandloom} suggestions={classificationSuggestions.regionalHandloom} onChange={(values) => change("regionalHandloom", values)} placeholder="Search or add a tradition"/>
           </div>
           <div className="form-row">
             <ClassificationField label="Weave / Print Technique" field="craft-technique" values={draft.craftTechnique} suggestions={classificationSuggestions.craftTechnique} onChange={(values) => change("craftTechnique", values)} placeholder="Search or add a technique"/>
             <ClassificationField label="Region of Origin" field="region" values={draft.region} suggestions={classificationSuggestions.region} onChange={(values) => change("region", values)} placeholder="Search or add an origin"/>
           </div>
           <ClassificationField label="Colour" field="colour" values={draft.colour} suggestions={classificationSuggestions.colour} onChange={(values) => change("colour", values)} placeholder="Search or add a colour"/>
         </fieldset>
         <fieldset className="admin-product-collections">
            <legend>Collections</legend>
            <p className="field-note">Collections group products under “Shop by Collection.” They are separate from Fabric and Weave categories.</p>
           {collectionsLoading&&<p className="field-note" role="status">Loading collections…</p>}
           {collectionsError&&<p className="field-note" role="status">Collections could not be loaded. You can still save this product without assigning one.</p>}
           {!collectionsLoading&&!collections.length&&!collectionsError&&<p className="field-note">No manual collections yet. This product can still be published and will appear in All Products.</p>}
           {collections.length>0&&<div className="admin-collection-options">
             {collections.map((collection)=><label key={collection.id} className="check-line">
               <input type="checkbox" checked={draft.collectionIds.includes(collection.id)} onChange={(event)=>{
                 setDraft((old)=>({...old,collectionIds:event.target.checked
                   ?[...new Set([...old.collectionIds,collection.id])]
                   :old.collectionIds.filter((id)=>id!==collection.id)}));
               }}/>
                <span><b>{collection.title}</b><small>Product group</small></span>
             </label>)}
           </div>}
           <label>Create or assign a collection<input maxLength={120} value={draft.newCollectionTitle} onChange={(e)=>change("newCollectionTitle",e.target.value)} placeholder="The Crafts Edit"/></label>
           <p className="field-note">If the name already exists, this product will be added to that collection. Otherwise Shopify will create it and assign this product.</p>
         </fieldset>
        <ProductPhotoPicker productId={productId} existingImage={existingImage} disabled={busy} onUploading={setUploading} onPending={setPhotoPending} onImage={(url) => { setPhotoUrl(url); change("imageUrl", ""); }}/>
        <label>Or add a public image URL <span className="label-hint">Optional; existing images stay</span><input type="url" disabled={busy || uploading || photoPending || !!photoUrl} value={draft.imageUrl} onChange={(e) => change("imageUrl", e.target.value)} placeholder="https://…" data-testid="input-product-image-url"/></label>
         <label className="check-line"><input type="checkbox" checked={draft.publishToWebsite} onChange={(e) => change("publishToWebsite", e.target.checked)} data-testid="input-product-publish"/><span><b>Publish to website</b><small>Publishes to the connected storefront channel. A collection is optional; published products also appear in All Products.</small></span></label>
        {error && <p className="form-error" role="alert" data-testid="text-product-form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" disabled={busy || uploading} onClick={onClose} data-testid="button-cancel-product">Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || uploading || photoPending} data-testid="button-save-product">{busy || uploading ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {uploading ? "Uploading photo…" : busy ? "Saving…" : "Save product"}</button></div>
      </form>
    </section>
  </div>;
}

export function ProductForm({ product, onClose, currencyCode }: { product?: ShopifyAdminProduct; onClose: () => void; currencyCode?: string }) {
  const queryClient = useQueryClient();
  const create = useCreateShopifyAdminProduct();
  const update = useUpdateShopifyAdminProduct();
  const productDetails = useGetShopifyAdminProduct(product?.id ?? "", { query: { queryKey: getGetShopifyAdminProductQueryKey(product?.id ?? ""), enabled: Boolean(product) } });
  const catalogProducts = useGetShopifyAdminProducts();
  const collectionsQuery = useGetShopifyAdminCollections();
  const detailedProduct = productDetails.data?.product ?? product;
  const [error, setError] = useState("");
  const draft: ProductDraft = detailedProduct ? {
    title: detailedProduct.title, description: detailedProduct.description || "", productType: detailedProduct.productType || "",
    tags: detailedProduct.tags.join(", "), fabric: parseClassificationValues(detailedProduct.fabric),
    regionalHandloom: parseClassificationValues(detailedProduct.regionalHandloom),
    craftTechnique: parseClassificationValues(detailedProduct.craftTechnique), region: parseClassificationValues(detailedProduct.region),
    colour: parseClassificationValues(detailedProduct.colour), collectionIds: detailedProduct.collectionIds || [],
    newCollectionTitle: "", price: detailedProduct.variants[0]?.price || "",
     weightKg: detailedProduct.variants[0]?.weightKg == null ? "" : String(detailedProduct.variants[0].weightKg),
    inventoryQuantity: String(detailedProduct.variants[0]?.inventoryQuantity ?? 0),
    imageUrl: "", publishToWebsite: detailedProduct.status === "ACTIVE",
  } : blankProduct;
  const productList = catalogProducts.data?.products ?? [];
  const classificationSuggestions = {
    fabric: uniqueValues([...productList.flatMap((item) => parseClassificationValues(item.fabric)), "Cotton", "Pure Cotton", "Silk", "Pure Silk", "Cotton-Silk"]),
    regionalHandloom: uniqueValues([...REGIONAL_HANDLOOMS, ...productList.flatMap((item) => parseClassificationValues(item.regionalHandloom))]),
    craftTechnique: uniqueValues([...WEAVE_PRINTS, ...productList.flatMap((item) => parseClassificationValues(item.craftTechnique))]),
    region: uniqueValues(productList.flatMap((item) => parseClassificationValues(item.region))),
    colour: uniqueValues(productList.flatMap((item) => parseClassificationValues(item.colour))),
  };
  const productTypeSuggestions = uniqueValues(productList.map((item) => item.productType));
  const busy = create.isPending || update.isPending;
  const save = (values: ProductDraft) => {
    setError("");
    const attributes = {
      fabric: serializeClassificationValues(values.fabric),
      regionalHandloom: serializeClassificationValues(values.regionalHandloom),
      craftTechnique: serializeClassificationValues(values.craftTechnique),
      region: serializeClassificationValues(values.region),
      colour: serializeClassificationValues(values.colour),
    };
    if (Object.values(attributes).some((value) => value.length > 255)) {
      setError("Each classification can contain up to 255 characters. Remove a value or shorten its name.");
      return;
    }
    const input = {
      title: values.title.trim(), description: values.description, productType: values.productType.trim(),
      tags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      ...attributes,
      collectionIds: values.collectionIds, newCollectionTitle: values.newCollectionTitle.trim(),
      ...(!product ? {
        price: Number(values.price),
        inventoryQuantity: Number(values.inventoryQuantity),
        weightKg: Number(values.weightKg),
      } : {}),
      ...(values.imageUrl.trim() ? { imageUrl: values.imageUrl.trim() } : {}),
      publishToWebsite: values.publishToWebsite,
    };
    const options = {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() }); onClose(); },
      onError: (reason: Error) => setError(reason.message || "Please check your details and try again."),
    };
    if (product) update.mutate({ productId: product.id, data: input }, options);
    else create.mutate({
      data: {
        ...input,
        price: Number(values.price),
        inventoryQuantity: Number(values.inventoryQuantity),
        weightKg: Number(values.weightKg),
      },
    }, options);
  };
  if (product && productDetails.isLoading) return <LoadingPanel/>;
  if (product && productDetails.isError) return <ErrorPanel message={readableError(productDetails.error,"This product could not be loaded.")} retry={()=>{void productDetails.refetch();}}/>;
  return <ProductModal initial={draft} onClose={onClose} onSave={save} busy={busy} error={error} allowVariantEdits={!product} currencyCode={currencyCode} existingImage={detailedProduct?.imageUrl} productId={product?.id} collections={collectionsQuery.data?.collections||[]} collectionsLoading={collectionsQuery.isLoading} collectionsError={collectionsQuery.isError?readableError(collectionsQuery.error,""):undefined} classificationSuggestions={classificationSuggestions} productTypeSuggestions={productTypeSuggestions}/>;
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
        <StockWatch/>
        <div className="section-heading"><div><span className="eyebrow">RECENTLY IN YOUR COLLECTION</span><h2>Products to keep an eye on</h2></div><Link href="/admin/products" className="text-link" data-testid="link-all-products">All products <ArrowRight size={15}/></Link></div>
        {productList.length ? <div className="recent-list">{productList.slice(0, 4).map((product) => <ProductRow key={product.id} product={product} currencyCode={currencyCode} compact/>)}</div> :
          <EmptyPanel icon={<Box size={21}/>} title="Your collection is ready for its first piece" body="Add a product to start building your live handloom catalog." action={<button className="button button-primary" onClick={() => setLocation("/admin/products?create=1")} data-testid="button-add-first-product"><Plus size={16}/> Add your first product</button>}/>}
      </>
    }
  </AdminLayout>;
}

function ProductRow({ product, currencyCode, compact, deletePending, onEdit, onArchive, onDelete, onVariants }: {
  product: ShopifyAdminProduct; currencyCode?: string; compact?: boolean; deletePending?: boolean; onEdit?: () => void; onArchive?: () => void; onDelete?: () => void; onVariants?: () => void;
}) {
  const price = product.variants[0]?.price ?? "—";
  return <article className="product-row" data-testid={`row-product-${product.id}`}>
    <div className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy"/> : <span><Tag size={20}/></span>}</div>
    <div className="product-info"><b data-testid={`text-product-title-${product.id}`}>{product.title}</b><small>{product.productType || "Handloom"}{product.tags.length ? ` · ${product.tags.slice(0, 2).join(", ")}` : ""}</small></div>
    <div className="product-price" data-testid={`text-product-price-${product.id}`}>{product.variants.length > 1 ? "By variant" : currency(price, currencyCode)}</div>
    <StatusPill status={product.status} productId={product.id}/>
    {!compact && <div className="row-actions">{product.status !== "ARCHIVED" && <><button className="text-button" onClick={onEdit} data-testid={`button-edit-product-${product.id}`}>Edit</button><button className="text-button" onClick={onVariants} data-testid={`button-variants-product-${product.id}`}>Variants & stock</button><button className="text-button danger-text" onClick={onArchive} data-testid={`button-archive-product-${product.id}`}>Archive</button></>}<button className="text-button danger-text" title={`Permanently delete ${product.title}`} aria-label={`Permanently delete ${product.title}`} onClick={onDelete} disabled={deletePending} data-testid={`button-delete-product-${product.id}`}>{deletePending ? "Deleting…" : "Delete"}</button></div>}
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
  const [variantProduct, setVariantProduct] = useState<ShopifyAdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const products = useGetShopifyAdminProducts();
  const archive = useArchiveShopifyAdminProduct();
  const permanentlyDelete = usePermanentlyDeleteShopifyAdminProduct();
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
  const onDelete = (product: ShopifyAdminProduct) => {
    if (!window.confirm(`Permanently delete “${product.title}” from Shopify? This cannot be undone. If you only want to hide it, choose Archive instead.`)) return;
    setNotice("");
    setDeletingProductId(product.id);
    permanentlyDelete.mutate({ productId: product.id }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetShopifyAdminInventoryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() });
        setNotice(`${product.title} was permanently deleted from Shopify.`);
      },
      onError: (error: Error) => setNotice(`Could not delete ${product.title}: ${productDeletionError(error)} The product is still shown in this list, and Delete remains available to retry.`),
      onSettled: () => setDeletingProductId(null),
    });
  };
  return <AdminLayout title="Your products" eyebrow="SHOPIFY CATALOG" action={<button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-create-product"><Plus size={17}/> Add product</button>}>
    <div className="catalog-toolbar"><div className="toolbar-count"><b>{products.data?.products.length ?? "—"}</b> products in your catalog</div><label className="search-field"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product" aria-label="Find a product" data-testid="input-search-products"/></label></div>
    {notice && <div className={`inline-notice ${notice.includes("Could not") ? "notice-error" : ""}`} role={notice.includes("Could not") ? "alert" : "status"} data-testid="status-product-notice">{notice.includes("Could not") ? <CircleAlert size={16} /> : <Check size={16} />}{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")} data-testid="button-dismiss-notice"><X size={15} /></button></div>}
    {products.isLoading ? <LoadingPanel/> : products.isError ? <ErrorPanel message={readableError(products.error, "We couldn’t reach your Shopify catalog.")} retry={() => void products.refetch()}/> :
       rows.length ? <div className="catalog-table"><div className="table-head"><span>PRODUCT</span><span>PRICE</span><span>STATUS</span><span>ACTIONS</span></div>{rows.map((product) => <ProductRow key={product.id} product={product} currencyCode={products.data?.currencyCode} deletePending={deletingProductId === product.id} onEdit={() => setEditing(product)} onVariants={() => setVariantProduct(product)} onArchive={() => onArchive(product)} onDelete={() => onDelete(product)}/>)}</div> :
        <EmptyPanel icon={<PackagePlus size={22}/>} title={search ? "No matching products" : "Your catalog is still unwoven"} body={search ? "Try another name or tag." : "Add your first saree and keep its price, stock and story together."} action={!search ? <button className="button button-primary" onClick={() => setCreating(true)} data-testid="button-empty-create-product"><Plus size={16}/> Add a product</button> : undefined}/>
    }
    {(creating || createRequested) && <ProductForm onClose={() => { setCreating(false); if (createRequested) window.history.replaceState({}, "", "/admin/products"); }} currencyCode={products.data?.currencyCode}/>}
    {editing && <ProductForm product={editing} onClose={() => setEditing(null)} currencyCode={products.data?.currencyCode}/>}
    {variantProduct && <VariantEditor productId={variantProduct.id} onClose={() => setVariantProduct(null)}/>}
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
  const [location] = useLocation();
  return <div className="auth-gate"><div className="auth-gate-card"><span className="brand-seal">C</span><span className="eyebrow">MERCHANT WORKROOM</span><h1>Welcome back.</h1><p>Sign in to tend your storefront content, collection and offers.</p><Link href={`/sign-in?redirect_url=${encodeURIComponent(location)}`} className="button button-primary" data-testid="link-admin-sign-in">Sign in to continue <ArrowRight size={16}/></Link><small>Your shoppers will never see this workspace.</small></div></div>;
}

