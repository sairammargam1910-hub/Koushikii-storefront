import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Shell, PageHero, products, ProductGrid, cottonWeaves } from "./_shared";
import { defaultFilters, filterCatalog, normalizeRegion, normalizeWeave, regions } from "./_shared/catalog-filter";
import type { CatalogFilters } from "./_shared/catalog-filter";

function readFilters():CatalogFilters {
 const params=new URLSearchParams(window.location.search);
 return {...defaultFilters,query:params.get("q")||"",fabric:params.get("fabric")||defaultFilters.fabric,
  weave:params.has("weave")?normalizeWeave(params.get("weave")!):defaultFilters.weave,
  category:params.get("category")||defaultFilters.category,region:normalizeRegion(params.get("region")||""),
  edit:params.get("edit")||"all",sort:params.get("sort")||"Featured"};
}
export function Collections(){
 const [filters,setFilters]=useState<CatalogFilters>(readFilters);
 const [location]=useLocation();
 const {query,fabric,weave,category,region,edit,sort}=filters;
 const update=(values:Partial<CatalogFilters>)=>setFilters(f=>({...f,...values}));
 useEffect(()=>{setFilters(readFilters())},[location]);
 useEffect(()=>{
  const params=new URLSearchParams();
  Object.entries(filters).forEach(([key,value])=>{if(value!==defaultFilters[key as keyof CatalogFilters])params.set(key==="query"?"q":key,value)});
  const search=params.toString();
  window.history.replaceState(null,"",window.location.pathname+(search?"?"+search:"")+window.location.hash);
 },[filters]);
 const filtered=useMemo(()=>filterCatalog(products,filters),[filters]);
 const weaves=Array.from(new Set([...products.map(p=>p.weave),...cottonWeaves.map(normalizeWeave),weave])).filter(w=>w!=="All weaves");
 const active=Object.entries(filters).filter(([key,value])=>value!==defaultFilters[key as keyof CatalogFilters]);
  return <Shell><PageHero eyebrow="The collection · Sample catalog" title={edit==="premium"?"The Premium Collection":edit==="new"?"New Arrivals":"Cloth with a place. Weaves with a story."} subtitle="Explore South Indian temple borders and the textile traditions of India. Choose a region, fabric or weave to find your thread."/>
 <main className="content wrap">
  <div className="toolbar collection-toolbar">{["All pieces","Sarees","Dupattas"].map(c=><button key={c} className="btn small outline" aria-pressed={category===c} style={{background:category===c?"#efe2c8":"transparent"}} onClick={()=>update({category:c})}>{c}</button>)}
  <label style={{marginLeft:"auto",fontSize:12}}>Collection edit <select value={edit} onChange={e=>update({edit:e.target.value})}><option value="all">All collections</option><option value="premium">Premium Collection</option><option value="new">New Arrivals</option>{!["all","premium","new"].includes(edit)&&<option value={edit}>Unknown edit: {edit}</option>}</select></label></div>
  <details><summary>Cotton handlooms · Explore regional weaves</summary><div className="toolbar">{cottonWeaves.map(w=><button key={w} className="pill" style={{border:"1px solid var(--line)"}} onClick={()=>update({weave:normalizeWeave(w),fabric:"Cotton",category:"Sarees"})}>{w}</button>)}</div><p className="muted">The sample catalog represents only a few traditions. Some selections have no sample pieces.</p></details>
   <div className="filterbar"><input data-testid="input-collection-search" aria-label="Search collection" type="search" placeholder="Search by weave or name…" value={query} onChange={e=>update({query:e.target.value})}/>
    <select data-testid="select-region-filter" aria-label="Filter by region" value={region} onChange={e=>update({region:e.target.value})}><option value="">All regions</option>{region&&!regions[region]&&<option value={region}>Unknown region: {region}</option>}{Object.entries(regions).sort((a,b)=>a[1].localeCompare(b[1])).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select>
    <select data-testid="select-fabric-filter" aria-label="Filter by fabric" value={fabric} onChange={e=>update({fabric:e.target.value})}>{Array.from(new Set(["All fabrics","Cotton","Silk","Cotton-Silk","Other blends",fabric])).map(f=><option key={f}>{f}</option>)}</select>
    <select data-testid="select-weave-filter" aria-label="Filter by weave" value={weave} onChange={e=>update({weave:e.target.value})}><option>All weaves</option>{weaves.map(w=><option key={w}>{w}</option>)}</select>
    <select data-testid="select-collection-sort" aria-label="Sort collection" value={sort} onChange={e=>update({sort:e.target.value})}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select>
  </div>
  <div className="active-filters" aria-live="polite"><strong>{filtered.length} sample {filtered.length===1?"piece":"pieces"}</strong>{active.map(([key,value])=><span className="pill" key={key}>{key==="region"?"Region: "+(regions[value]||"Unknown ("+value+")"):key+": "+value}</span>)}{active.length>0&&<button className="btn small outline" onClick={()=>setFilters({...defaultFilters})}>Clear all filters</button>}</div>
  {filtered.length?<ProductGrid items={filtered}/>:<div className="empty"><span className="eyebrow">A collection to discover</span><h2 style={{marginTop:15}}>No sample pieces match.</h2><p>{region?`There are no sample ${category==="Sarees"?"sarees":"pieces"} for ${regions[region]||"this unrecognised region"} with the selected filters.`:"Try changing a filter to discover another textile."} No other regions have been substituted.</p><button className="btn" onClick={()=>setFilters({...defaultFilters})}>Reset to all pieces</button></div>}
  <p className="muted" style={{fontSize:11,marginTop:25}}>Design preview · Sample products, prices and illustrative pattern swatches. Regional assignments support collection discovery only; they do not certify origin, fibre or handloom production.</p>
 </main></Shell>;
}
