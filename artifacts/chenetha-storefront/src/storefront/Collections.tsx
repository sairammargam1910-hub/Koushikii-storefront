import { useEffect, useMemo, useState } from "react";
import { Shell, PageHero } from "./_shared";
import { defaultFilters, normalizeRegion, regions } from "./_shared/catalog-filter";
import type { CatalogFilters } from "./_shared/catalog-filter";
import {
  filterShopifyProducts,
  getAvailableShopifyCollections,
  ShopifyProductGrid,
  useShopifyCatalog,
} from "./ShopifyCatalog";
import { FABRIC_CATEGORIES, fabricGroup, getShopifyAttributeValues } from "./shopifyCatalogData";
import "./ShopifyCatalog.css";

type FilterKey = "fabrics" | "regionalHandlooms" | "weaves" | "productTypes" | "regions" | "colours";
const FILTER_GROUPS: Array<{ key: FilterKey; title: string }> = [
  { key: "fabrics", title: "Fabric" },
  { key: "regionalHandlooms", title: "Regional Handloom" },
  { key: "weaves", title: "Weave / Print" },
  { key: "productTypes", title: "Product Type" },
  { key: "regions", title: "Region of Origin" },
  { key: "colours", title: "Colour" },
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function readFilters(): CatalogFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    ...defaultFilters,
    query: params.get("q") || "",
    fabrics: params.getAll("fabric").length ? params.getAll("fabric") : params.get("fabric") ? [params.get("fabric")!] : [],
    regionalHandlooms: params.getAll("regionalHandloom").length ? params.getAll("regionalHandloom") : params.get("handloom") ? [params.get("handloom")!] : [],
    weaves: params.getAll("weave").length ? params.getAll("weave") : [],
    productTypes: params.getAll("productType").length ? params.getAll("productType") : params.get("productType") ? [params.get("productType")!] : [],
    regions: params.getAll("region").length ? params.getAll("region") : params.get("region") ? [params.get("region")!] : [],
    colours: params.getAll("colour").length ? params.getAll("colour") : params.get("colour") ? [params.get("colour")!] : [],
    minPrice: params.get("minPrice") || "",
    maxPrice: params.get("maxPrice") || "",
    collection: params.get("collection") || "",
    sort: params.get("sort") || defaultFilters.sort,
  };
}

function selectedCount(filters: CatalogFilters) {
  return FILTER_GROUPS.reduce((count, group) => count + filters[group.key].length, 0) +
    Number(Boolean(filters.minPrice || filters.maxPrice)) +
    Number(Boolean(filters.collection));
}

function filterLabel(key: FilterKey, value: string) {
  if (key === "regions") return regions[normalizeRegion(value)] || value;
  return value;
}

export function Collections() {
  const catalog = useShopifyCatalog();
  const [applied, setApplied] = useState<CatalogFilters>(readFilters);
  const [draft, setDraft] = useState<CatalogFilters>(readFilters);
  const [locationKey, setLocationKey] = useState(window.location.pathname + window.location.search);
  const liveProducts = catalog.data?.products || [];
  const availableCollections = getAvailableShopifyCollections(liveProducts);
  const availableCollectionHandles = new Set(availableCollections.map(({ handle }) => handle));

  useEffect(() => {
    const syncLocation = () => setLocationKey(window.location.pathname + window.location.search);
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (applied.query) params.set("q", applied.query);
    for (const [key, values] of [
      ["fabric", applied.fabrics],
      ["regionalHandloom", applied.regionalHandlooms],
      ["weave", applied.weaves],
      ["productType", applied.productTypes],
      ["region", applied.regions],
      ["colour", applied.colours],
    ] as Array<[string, string[]]>) {
      values.forEach((value) => params.append(key, value));
    }
    if (applied.minPrice) params.set("minPrice", applied.minPrice);
    if (applied.maxPrice) params.set("maxPrice", applied.maxPrice);
    if (applied.collection) params.set("collection", applied.collection);
    if (applied.sort !== defaultFilters.sort) params.set("sort", applied.sort);
    const search = params.toString();
    const nextUrl = window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
    if (nextUrl !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", nextUrl);
      setLocationKey(nextUrl);
    }
  }, [applied]);

  useEffect(() => {
    if (locationKey === window.location.pathname + window.location.search) return;
    const next = readFilters();
    setApplied(next);
    setDraft(next);
  }, [locationKey]);

  const productsByFabric = useMemo(() => liveProducts.flatMap((product) =>
    getShopifyAttributeValues(product, "fabric").map((value) => ({ value, group: fabricGroup(value) })),
  ), [liveProducts]);
  const fabricOptions: string[] = FABRIC_CATEGORIES.filter((category) => productsByFabric.some((item) =>
    category === "Others" ? item.group === "Others" : item.group === category,
  ));
  const options: Record<FilterKey, string[]> = {
    fabrics: fabricOptions,
    regionalHandlooms: unique(liveProducts.flatMap((product) => getShopifyAttributeValues(product, "regionalHandloom"))),
    weaves: unique(liveProducts.flatMap((product) => getShopifyAttributeValues(product, "weave"))),
    productTypes: unique(liveProducts.map((product) => product.productType)),
    regions: unique(liveProducts.flatMap((product) => getShopifyAttributeValues(product, "region"))),
    colours: unique(liveProducts.flatMap((product) => getShopifyAttributeValues(product, "colour"))),
  };

  const effectiveFilters = {
    ...applied,
    collection: availableCollectionHandles.has(applied.collection) ? applied.collection : "",
  };
  const filteredProducts = useMemo(
    () => filterShopifyProducts(liveProducts, effectiveFilters),
    [liveProducts, applied],
  );
  const activeCount = selectedCount(applied);

  function toggleDraft(key: FilterKey, value: string) {
    setDraft((current) => {
      const selected = current[key];
      return {
        ...current,
        [key]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  }

  function applyFilters() {
    setApplied({ ...draft });
  }

  function clearAll() {
    setDraft({ ...defaultFilters });
    setApplied({ ...defaultFilters });
  }

  function removeChip(key: FilterKey, value: string) {
    const update = (current: CatalogFilters) => ({
      ...current,
      [key]: current[key].filter((item) => item !== value),
    });
    setApplied(update);
    setDraft(update);
  }

  const searchParams = new URLSearchParams(window.location.search);
  const legacyEdit = searchParams.get("edit");

  return <Shell>
    <PageHero
      eyebrow="Shop the collection"
      title={legacyEdit === "premium" ? "Premium Collection" : legacyEdit === "new" ? "New Arrivals" : "All published products"}
      subtitle="Explore the products published in Shopify. Refine by material, tradition, technique and more."
    />
    <main className="content wrap">
      <div className="catalog-controls">
        <label className="catalog-search">
          <span className="sr-only">Search products</span>
          <input
            data-testid="input-collection-search"
            aria-label="Search products"
            type="search"
            placeholder="Search products…"
            value={applied.query}
            onChange={(event) => {
              const query = event.target.value;
              setApplied((current) => ({ ...current, query }));
              setDraft((current) => ({ ...current, query }));
            }}
          />
        </label>
        <details className="filter-sort-drawer">
          <summary data-testid="button-filter-sort">
            Filter &amp; Sort{activeCount > 0 && <span className="filter-count">{activeCount}</span>}
          </summary>
          <div className="filter-sort-panel">
            <div className="filter-sort-heading">
              <div><span className="eyebrow">Refine the collection</span><h2>Filter &amp; Sort</h2></div>
              <label>Sort by
                <select
                  data-testid="select-collection-sort"
                  value={draft.sort}
                  onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value }))}
                >
                  <option>Featured</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                  <option>Newest</option>
                </select>
              </label>
            </div>
            {FILTER_GROUPS.map(({ key, title }) => options[key].length > 0 && (
              <details key={key} className={`filter-section${key === "fabrics" ? " is-primary" : ""}`} open={false}>
                <summary>{title}<span>{draft[key].length > 0 ? `${draft[key].length} selected` : ""}</span></summary>
                <div className="filter-options">
                  {options[key].map((value) => (
                    <label key={value} className="filter-option">
                      <input
                        type="checkbox"
                        checked={draft[key].includes(value)}
                        onChange={() => toggleDraft(key, value)}
                        aria-label={`Filter by ${title.toLowerCase()}: ${value}`}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
            <details className="filter-section" open={false}>
              <summary>Price Range</summary>
              <div className="filter-price-range">
                <label>Minimum price<input type="number" min="0" value={draft.minPrice} onChange={(event) => setDraft((current) => ({ ...current, minPrice: event.target.value }))}/></label>
                <label>Maximum price<input type="number" min="0" value={draft.maxPrice} onChange={(event) => setDraft((current) => ({ ...current, maxPrice: event.target.value }))}/></label>
              </div>
            </details>
            {availableCollections.length > 0 && (
              <details className="filter-section" open={false}>
                <summary>Shopify Collection</summary>
                <label className="filter-collection">Collection
                  <select
                    aria-label="Filter by Shopify collection"
                    value={draft.collection}
                    onChange={(event) => setDraft((current) => ({ ...current, collection: event.target.value }))}
                  >
                    <option value="">All collections</option>
                    {availableCollections.map(({ handle, title }) => <option key={handle} value={handle}>{title}</option>)}
                  </select>
                </label>
              </details>
            )}
            <div className="filter-actions">
              <button type="button" className="btn outline" onClick={clearAll}>Clear All</button>
              <button type="button" className="btn" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        </details>
      </div>
      <div className="active-filters" aria-live="polite">
        <strong>{catalog.isLoading && !catalog.data ? "Loading Shopify products…" : `${filteredProducts.length} published ${filteredProducts.length === 1 ? "product" : "products"}`}</strong>
        {FILTER_GROUPS.flatMap(({ key, title }) => applied[key].map((value) => (
          <button type="button" className="filter-chip" key={`${key}:${value}`} onClick={() => removeChip(key, value)} aria-label={`Remove ${title} filter ${value}`}>
            {title}: {filterLabel(key, value)} <span aria-hidden="true">×</span>
          </button>
        )))}
        {(applied.minPrice || applied.maxPrice) && (
          <button type="button" className="filter-chip" onClick={() => {
            setApplied((current) => ({ ...current, minPrice: "", maxPrice: "" }));
            setDraft((current) => ({ ...current, minPrice: "", maxPrice: "" }));
          }}>
            Price: {applied.minPrice || "0"} – {applied.maxPrice || "Any"} <span aria-hidden="true">×</span>
          </button>
        )}
        {applied.collection && availableCollectionHandles.has(applied.collection) && (
          <button type="button" className="filter-chip" onClick={() => {
            setApplied((current) => ({ ...current, collection: "" }));
            setDraft((current) => ({ ...current, collection: "" }));
          }}>
            Collection: {availableCollections.find(({ handle }) => handle === applied.collection)?.title} <span aria-hidden="true">×</span>
          </button>
        )}
        {applied.query && <button type="button" className="filter-chip" onClick={() => {
          setApplied((current) => ({ ...current, query: "" }));
          setDraft((current) => ({ ...current, query: "" }));
        }}>Search: {applied.query} <span aria-hidden="true">×</span></button>}
      </div>
      {catalog.isLoading && !catalog.data
        ? <p role="status" className="shopify-catalog-status">Loading the collection…</p>
        : catalog.isError && !catalog.data
          ? <div className="empty"><span className="eyebrow">Shopify catalog unavailable</span><h2 style={{ marginTop: 15 }}>We couldn’t load the products just now.</h2><p>Your store data has not been replaced with sample products. Try again in a moment.</p><button className="btn" onClick={() => void catalog.refetch()}>Try again</button></div>
          : liveProducts.length
            ? filteredProducts.length
              ? <ShopifyProductGrid products={filteredProducts}/>
              : <div className="empty"><span className="eyebrow">No matching products</span><h2 style={{ marginTop: 15 }}>No published products match these filters.</h2><p>Change or clear the filters to see other products.</p><button className="btn" onClick={clearAll}>Clear All</button></div>
            : <div className="empty"><span className="eyebrow">Shopify catalog</span><h2 style={{ marginTop: 15 }}>No published products are available yet.</h2><p>Published products will appear here directly from Shopify.</p></div>}
      {catalog.isError && catalog.data && <p role="status" className="shopify-catalog-status">Showing the last successfully loaded Shopify catalog; the latest refresh failed.</p>}
      <p className="muted" style={{ fontSize: 11, marginTop: 25 }}>Product names, photos, prices and collection membership come from Shopify. Product classification is maintained separately for fabric, regional tradition, technique and region of origin.</p>
    </main>
  </Shell>;
}
