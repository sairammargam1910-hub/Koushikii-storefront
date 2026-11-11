import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Shell, PageHero } from "./_shared";
import { defaultFilters, normalizeRegion, normalizeWeave, regions } from "./_shared/catalog-filter";
import type { CatalogFilters } from "./_shared/catalog-filter";
import { filterShopifyProducts, getAvailableShopifyCollections, getShopifyAttribute, ShopifyProductGrid, useShopifyCatalog } from "./ShopifyCatalog";

function readFilters():CatalogFilters {
 const params=new URLSearchParams(window.location.search);
 return {...defaultFilters,query:params.get("q")||"",fabric:params.get("fabric")||defaultFilters.fabric,
  weave:params.has("weave")?normalizeWeave(params.get("weave")!):defaultFilters.weave,
   category:params.get("category")||defaultFilters.category,productType:params.get("productType")||"",
   region:normalizeRegion(params.get("region")||""),colour:params.get("colour")||"",
   collection:params.get("collection")||"",
  edit:params.get("edit")||"all",sort:params.get("sort")||"Featured"};
}
export function Collections(){
 const [filters,setFilters]=useState<CatalogFilters>(readFilters);
  const catalog=useShopifyCatalog();
 const [location]=useLocation();
   const {query,fabric,weave,productType,region,colour,collection,edit,sort}=filters;
 const update=(values:Partial<CatalogFilters>)=>setFilters(f=>({...f,...values}));
 useEffect(()=>{setFilters(readFilters())},[location]);
 useEffect(()=>{
  const params=new URLSearchParams();
  Object.entries(filters).forEach(([key,value])=>{if(value!==defaultFilters[key as keyof CatalogFilters])params.set(key==="query"?"q":key,value)});
  const search=params.toString();
  window.history.replaceState(null,"",window.location.pathname+(search?"?"+search:"")+window.location.hash);
 },[filters]);
  const liveProducts=catalog.data?.products||[];
   const availableCollections=getAvailableShopifyCollections(liveProducts);
   const availableCollectionHandles=new Set(availableCollections.map(({handle})=>handle));
    const legacyEditTitle=edit==="premium"?"premium collection":edit==="new"?"new arrivals":null;
    const legacyEditCollection=legacyEditTitle?availableCollections.find(item=>item.title.trim().toLowerCase()===legacyEditTitle):undefined;
    const effectiveFilters=legacyEditTitle
      ?{...filters,edit:"all",collection:legacyEditCollection?.handle||"__missing_collection__"}
      :{...filters,edit:"all"};
   const liveFiltered=useMemo(()=>filterShopifyProducts(liveProducts,effectiveFilters),[liveProducts,effectiveFilters]);
    const weaves=Array.from(new Set(liveProducts.map(p=>getShopifyAttribute(p,"craftTechnique")).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
   const productTypes=Array.from(new Set(liveProducts.map(p=>p.productType.trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
   const colours=Array.from(new Set(liveProducts.map(p=>getShopifyAttribute(p,"colour")).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    const fabricOptions=Array.from(new Set(liveProducts.map(p=>getShopifyAttribute(p,"fabric")).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    const regionOptions=Array.from(new Set(liveProducts.map(p=>getShopifyAttribute(p,"region")).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const active=Object.entries(filters).filter(([key,value])=>value!==defaultFilters[key as keyof CatalogFilters]&&(key!=="collection"||availableCollectionHandles.has(value)));
     return <Shell><PageHero eyebrow="Shop the collection" title={legacyEditCollection?.title||(edit==="premium"?"Premium Collection":edit==="new"?"New Arrivals":"All published products")} subtitle="Explore the products published in Shopify. Filter by the details your team maintains there."/>
 <main className="content wrap">
   <div className="toolbar collection-toolbar"><button className="btn small outline" aria-pressed={active.length===0} onClick={()=>setFilters({...defaultFilters})}>All products</button>
    {availableCollections.length>0&&<label style={{marginLeft:"auto",fontSize:12}}>Shop by collection <select aria-label="Filter by Shopify collection" value={legacyEditCollection?.handle||(availableCollectionHandles.has(collection)?collection:"")} onChange={e=>update({edit:"all",collection:e.target.value})}><option value="">All collections</option>{availableCollections.map(({handle,title})=><option key={handle} value={handle}>{title}</option>)}</select></label>}</div>
    <div className="filterbar"><input data-testid="input-collection-search" aria-label="Search products" type="search" placeholder="Search products…" value={query} onChange={e=>update({query:e.target.value})}/>
      <select data-testid="select-region-filter" aria-label="Filter by region" value={region} onChange={e=>update({region:e.target.value})}><option value="">All regions</option>{region&&!regionOptions.some(value=>normalizeRegion(value)===normalizeRegion(region))&&<option value={region}>{regions[normalizeRegion(region)]||region}</option>}{regionOptions.map(value=><option key={value} value={value}>{regions[normalizeRegion(value)]||value}</option>)}</select>
     <select data-testid="select-product-type-filter" aria-label="Filter by product type" value={productType} onChange={e=>update({productType:e.target.value})}><option value="">All product types</option>{productTypes.map(type=><option key={type}>{type}</option>)}</select>
     <select data-testid="select-fabric-filter" aria-label="Filter by fabric" value={fabric} onChange={e=>update({fabric:e.target.value})}><option>All fabrics</option>{fabric&&!fabricOptions.some(value=>value.toLowerCase()===fabric.toLowerCase())&&<option value={fabric}>{fabric}</option>}{fabricOptions.map(value=><option key={value}>{value}</option>)}</select>
      <select data-testid="select-weave-filter" aria-label="Filter by craft technique" value={weave} onChange={e=>update({weave:e.target.value})}><option value="All weaves">All craft techniques</option>{weaves.map(w=><option key={w}>{w}</option>)}</select>
     {colours.length>0&&<select data-testid="select-colour-filter" aria-label="Filter by colour" value={colours.some(value=>value.toLowerCase()===colour.toLowerCase())?colour:""} onChange={e=>update({colour:e.target.value})}><option value="">All colours</option>{colours.map(value=><option key={value}>{value}</option>)}</select>}
    <select data-testid="select-collection-sort" aria-label="Sort collection" value={sort} onChange={e=>update({sort:e.target.value})}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select>
  </div>
      <div className="active-filters" aria-live="polite"><strong>{catalog.isLoading&&!catalog.data?"Loading Shopify products…":`${liveFiltered.length} published ${liveFiltered.length===1?"product":"products"}`}</strong>{active.map(([key,value])=><span className="pill" key={key}>{key==="region"?"Region: "+(regions[normalizeRegion(value)]||value):key==="collection"?`Collection: ${availableCollections.find(({handle})=>handle===value)?.title||""}`:key==="edit"?`Collection: ${legacyEditCollection?.title||"Not available in Shopify"}`:key==="weave"?"Craft technique: "+value:key+": "+value}</span>)}{active.length>0&&<button className="btn small outline" onClick={()=>setFilters({...defaultFilters})}>Clear all filters</button>}</div>
    {catalog.isLoading&&!catalog.data?<p role="status" className="shopify-catalog-status">Loading the collection…</p>
      :catalog.isError&&!catalog.data?<div className="empty"><span className="eyebrow">Shopify catalog unavailable</span><h2 style={{marginTop:15}}>We couldn’t load the products just now.</h2><p>Your store data has not been replaced with sample products. Try again in a moment.</p><button className="btn" onClick={()=>void catalog.refetch()}>Try again</button></div>
      :liveProducts.length?liveFiltered.length?<ShopifyProductGrid products={liveFiltered}/>:<div className="empty"><span className="eyebrow">No matching products</span><h2 style={{marginTop:15}}>No published products match these filters.</h2><p>Change or clear the filters to see other Shopify products.</p><button className="btn" onClick={()=>setFilters({...defaultFilters})}>Reset filters</button></div>
      :<div className="empty"><span className="eyebrow">Shopify catalog</span><h2 style={{marginTop:15}}>No published products are available yet.</h2><p>Published products will appear here directly from Shopify.</p></div>}
     {catalog.isError&&catalog.data&&<p role="status" className="shopify-catalog-status">Showing the last successfully loaded Shopify catalog; the latest refresh failed.</p>}
     <p className="muted" style={{fontSize:11,marginTop:25}}>Product names, photos, options, prices and collection membership come from Shopify. Product attributes are maintained on each Shopify product; regional notes do not certify origin, fibre or handloom production.</p>
 </main></Shell>;
}
