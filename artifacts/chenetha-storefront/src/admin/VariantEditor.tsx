import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetShopifyAdminProduct, useUpdateShopifyAdminVariant,
  useCreateShopifyAdminVariant, useDeleteShopifyAdminVariant,
  getGetShopifyAdminProductQueryKey, getGetShopifyAdminProductsQueryKey,
  getGetShopifyProductsQueryKey,
  type ShopifyAdminProductVariant, type ShopifyAdminVariantUpdate,
  type ShopifyAdminProductOption, type ShopifyAdminVariantCreate,
  type ShopifyAdminInventoryLevel,
} from "@workspace/api-client-react";
import { X, RefreshCw, Trash2 } from "lucide-react";
import "./VariantEditor.css";

type Save = (variantId: string, data: ShopifyAdminVariantUpdate) => void;

function LocationStock({ level, tracked, disabled, save }: {
  level: ShopifyAdminInventoryLevel; tracked: boolean; disabled: boolean;
  save: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(String(level.available));
  const editable = tracked && level.active && !disabled;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editable || !quantity.trim()) return;
    if (window.confirm(`Set available pieces at ${level.locationName} from ${level.available} to ${quantity}? Shopify will stop selling this variant when tracked stock runs out.`)) save(Number(quantity));
  };
  return <form className="location-stock" onSubmit={submit}>
    <div><b>{level.locationName}</b><small>{!level.active ? "Inactive location · read only" : !tracked ? "Not tracked · enable in Shopify" : `Shopify available: ${level.available}`}</small></div>
    <label>Available pieces<input aria-label={`Available pieces at ${level.locationName}`} type="number" min="0" max="1000000" step="1" required disabled={!editable} value={quantity} onChange={(e) => setQuantity(e.target.value)}/></label>
    <button className="button button-quiet" disabled={!editable || !quantity.trim() || Number(quantity) === level.available}>Save stock</button>
  </form>;
}

function VariantCard({ variant, currencyCode, disabled, canDelete, save, remove }: {
  variant: ShopifyAdminProductVariant; currencyCode: string; disabled: boolean; canDelete: boolean;
  save: Save; remove: (variant: ShopifyAdminProductVariant) => void;
}) {
  const [price, setPrice] = useState(variant.price);
  const [options, setOptions] = useState(variant.selectedOptions);
  const optionSnapshot = JSON.stringify(variant.selectedOptions);
  useEffect(() => setPrice(variant.price), [variant.price]);
  useEffect(() => setOptions(JSON.parse(optionSnapshot)), [optionSnapshot]);
  const changed = Number(price) !== Number(variant.price) || options.some((option, i) => option.value !== variant.selectedOptions[i].value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!disabled && changed) save(variant.id, {
      ...(Number(price) !== Number(variant.price) ? { price: Number(price) } : {}),
      ...(options.some((option, i) => option.value !== variant.selectedOptions[i].value) ? { selectedOptions: options } : {}),
    });
  };
  return <article className="variant-card" data-testid={`variant-${variant.id}`}>
    <div className="variant-card-head"><h3>{variant.title === "Default Title" ? "Standard saree" : variant.title}</h3>
      <button type="button" className="button button-quiet variant-delete" data-testid={`delete-variant-${variant.id}`} disabled={disabled || !canDelete} onClick={() => remove(variant)}><Trash2 size={15}/> Delete variant</button>
    </div>
    <form className="variant-details admin-form" onSubmit={submit}>
      {options.filter((option) => option.name !== "Title").map((option) => <label key={option.name}>{option.name}<input required maxLength={255} disabled={disabled} value={option.value} onChange={(e) => setOptions((current) => current.map((entry) => entry.name === option.name ? { ...entry, value: e.target.value } : entry))}/></label>)}
      <label>Price ({currencyCode})<input type="number" min="0.01" step="0.01" required disabled={disabled} value={price} onChange={(e) => setPrice(e.target.value)}/></label>
      <button className="button button-quiet" disabled={disabled || !changed}>Save variant</button>
    </form>
    {variant.inventoryPolicy === "CONTINUE" && <p className="field-note">Shopify currently allows selling after stock runs out. Saving stock here switches this variant to “stop selling when out of stock”.</p>}
    {!variant.inventoryTracked && <p className="field-note">Inventory is not tracked. Enable “Track quantity” in Shopify, then refresh before editing stock.</p>}
    {variant.inventoryLevels.length ? variant.inventoryLevels.map((level) => <LocationStock
      key={`${level.locationId}:${level.available}:${variant.inventoryTracked}`}
      level={level} tracked={variant.inventoryTracked} disabled={disabled}
      save={(quantity) => save(variant.id, { stock: { locationId: level.locationId, quantity, compareQuantity: level.available } })}
    />) : <p className="field-note">No stocked locations. Assign this variant to a fulfillment location in Shopify, then refresh.</p>}
  </article>;
}

function NewVariantForm({ options, currencyCode, disabled, create }: {
  options: ShopifyAdminProductOption[]; currencyCode: string; disabled: boolean;
  create: (data: ShopifyAdminVariantCreate) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const selectedOptions = options.map((option) => ({ name: option.name, value: (values[option.name] ?? "").trim() }));
    if (!disabled && selectedOptions.every((option) => option.value) && Number(price) > 0) {
      create({ price: Number(price), selectedOptions });
    }
  };
  return <section className="new-variant-section" aria-labelledby="new-variant-heading">
    <h3 id="new-variant-heading">Add a size/color combination</h3>
    {!options.length ? <p className="field-note">Add at least one product option (such as Size or Color) in Shopify before creating variants here.</p> : <>
      <p className="field-note">Choose an existing value or type a new one. Shopify will not track stock on new variants by default; set up tracking and a location quantity in Shopify before making them available for sale.</p>
      <form className="new-variant-form admin-form" onSubmit={submit}>
        {options.map((option, index) => <label key={option.id}>{option.name}
          <input
            data-testid={`new-variant-option-${index}`}
            aria-label={`${option.name} for new variant`}
            list={`new-variant-values-${index}`}
            required maxLength={255} disabled={disabled}
            value={values[option.name] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [option.name]: event.target.value }))}
          />
          <datalist id={`new-variant-values-${index}`}>
            {option.values.map((value) => <option key={value.id} value={value.name}/>)}
          </datalist>
        </label>)}
        <label>Price ({currencyCode})<input data-testid="new-variant-price" type="number" min="0.01" step="0.01" required disabled={disabled} value={price} onChange={(event) => setPrice(event.target.value)}/></label>
        <button className="button button-primary" data-testid="create-variant" disabled={disabled || !options.length}>Create variant</button>
      </form>
    </>}
  </section>;
}

export function VariantEditor({ productId, onClose }: { productId: string; onClose: () => void }) {
  const client = useQueryClient();
  const product = useGetShopifyAdminProduct(productId, { query: { queryKey: getGetShopifyAdminProductQueryKey(productId), staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false } });
  const update = useUpdateShopifyAdminVariant();
  const create = useCreateShopifyAdminVariant();
  const remove = useDeleteShopifyAdminVariant();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const busy = update.isPending || create.isPending || remove.isPending || product.isFetching;
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: getGetShopifyAdminProductsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetShopifyProductsQueryKey() });
  };
  const refresh = async () => {
    if (!window.confirm("Reload current Shopify values? Unsaved edits will be discarded.")) return;
    const result = await product.refetch();
    if (result.isSuccess) { setNeedsRefresh(false); setError(""); setNotice("Loaded current Shopify quantities."); setRevision((value) => value + 1); }
  };
  const save: Save = (variantId, data) => {
    setError(""); setNotice("");
    update.mutate({ productId, variantId, data }, {
      onSuccess: (result) => {
        client.setQueryData(getGetShopifyAdminProductQueryKey(productId), result);
        invalidate();
        setNotice("Saved in Shopify. Prices and location quantities below are current.");
      },
      onError: (reason) => {
        setError(reason.message || "Could not save. Refresh before retrying.");
        setNeedsRefresh(true); invalidate();
      },
    });
  };
  const createVariant = (data: ShopifyAdminVariantCreate) => {
    setError(""); setNotice("");
    create.mutate({ productId, data }, {
      onSuccess: (result) => {
        client.setQueryData(getGetShopifyAdminProductQueryKey(productId), result);
        invalidate();
        setNeedsRefresh(false);
        setNotice("Variant created in Shopify. No stock was assigned; add tracking and location quantities in Shopify.");
        setRevision((value) => value + 1);
      },
      onError: (reason) => {
        setError(reason.message || "Could not create this variant.");
        setNeedsRefresh(true); invalidate();
      },
    });
  };
  const deleteVariant = (variant: ShopifyAdminProductVariant) => {
    const title = variant.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(", ");
    if (!window.confirm(`Permanently delete ${title || variant.title} from Shopify? This cannot be undone.`)) return;
    setError(""); setNotice("");
    remove.mutate({ productId, variantId: variant.id }, {
      onSuccess: (result) => {
        client.setQueryData(getGetShopifyAdminProductQueryKey(productId), result);
        invalidate();
        setNeedsRefresh(false);
        setNotice("Variant deleted from Shopify.");
        setRevision((value) => value + 1);
      },
      onError: (reason) => {
        setError(reason.message || "Could not delete this variant.");
        setNeedsRefresh(true); invalidate();
      },
    });
  };
  return <div className="modal-backdrop">
    <section className="admin-modal variant-modal" role="dialog" aria-modal="true" aria-labelledby="variant-editor-title">
      <header className="modal-head"><div><span className="eyebrow">VARIANTS & LOCATION STOCK</span><h2 id="variant-editor-title">{product.data?.product.title ?? "Loading variants…"}</h2></div>
        <button className="icon-button" aria-label="Close variants" disabled={busy} onClick={onClose}><X size={18}/></button></header>
      <div className="variant-content">
        <p className="field-note">Edit each size/color combination separately. Quantities are available pieces at the named location, never a combined total. Stock saves reject changes made since you loaded this screen.</p>
        <p className="field-note">Create combinations and delete obsolete variants here. Add or rename option types, enable tracking, assign locations, and set stock in <a href="https://admin.shopify.com/" target="_blank" rel="noreferrer">Shopify admin</a>.</p>
        <button className="button button-quiet" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15}/> Refresh Shopify values</button>
        {notice && <p role="status">{notice}</p>}
        {error && <p className="form-error" role="alert">{error} Refresh Shopify values before retrying; part of an update may have saved.</p>}
        {product.isLoading ? <p role="status">Loading every variant and location…</p> : product.isError ? <p className="form-error" role="alert">Could not load variants. Use Refresh Shopify values to try again.</p> :
          product.data?.product.variants.length ? <>
            <NewVariantForm key={revision} options={product.data.product.options.filter((option) => option.name !== "Title")} currencyCode={product.data.currencyCode} disabled={busy || needsRefresh} create={createVariant}/>
            {product.data.product.variants.map((variant) => <VariantCard
              key={`${variant.id}:${revision}`} variant={variant} currencyCode={product.data.currencyCode}
              disabled={busy || needsRefresh}
              canDelete={product.data!.product.variants.length > 1 && variant.title !== "Default Title" && !variant.selectedOptions.some((option) => option.name === "Title" && option.value === "Default Title")}
              save={save} remove={deleteVariant}
            />)}
          </> : <p>No variants returned by Shopify.</p>}
      </div>
    </section>
  </div>;
}
