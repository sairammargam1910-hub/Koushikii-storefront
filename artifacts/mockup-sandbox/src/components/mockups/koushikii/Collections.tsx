import { useMemo, useState } from "react";
import { Shell, PageHero, products, ProductGrid, cottonWeaves } from "./_shared";

export function Collections(){
 const params=new URLSearchParams(window.location.search);
 const [query,setQuery]=useState(params.get("q")||"");
 const [fabric,setFabric]=useState(params.get("fabric")||"All fabrics");
 const [weave,setWeave]=useState(params.get("weave")||"All weaves");
 const [category,setCategory]=useState(params.get("category")||"All pieces");
 const [sort,setSort]=useState("Featured");
 const [edit,setEdit]=useState(params.get("edit")||"all");
 const weaves=Array.from(new Set([...products.map(p=>p.weave),...cottonWeaves.map(w=>w.replace(" Cotton","")),weave])).filter(w=>w!=="All weaves");
 const filtered=useMemo(()=>products.filter(p=>
  (!query||`${p.name} ${p.weave} ${p.fabric} ${p.type}`.toLowerCase().includes(query.toLowerCase()))&&
  (fabric==="All fabrics"||p.fabric===fabric)&&
  (weave==="All weaves"||p.weave===weave)&&
  (category==="All pieces"||p.type.toLowerCase().includes(category.toLowerCase().startsWith("saree")?"saree":"dupatta"))&&
  (edit!=="premium"||p.price>=12000)&&
  (edit!=="new"||["New arrival","Just arrived","Hand-finished","Everyday"].includes(p.tag))
 ).sort((a,b)=>sort==="Price: low to high"?a.price-b.price:sort==="Price: high to low"?b.price-a.price:0),[query,fabric,weave,category,sort,edit]);
 return <Shell><PageHero eyebrow="The collection · Sample catalog" title={edit==="premium"?"The Premium Collection":edit==="new"?"New Arrivals":"Cloth with a place. Weaves with a story."} subtitle="From South Indian temple borders to the diverse textile traditions of India. Explore by fabric, weave or the way you wear it."/>
 <main className="content wrap">
  <div className="toolbar">{["All pieces","Sarees","Dupattas"].map(c=><button key={c} className="btn small outline" aria-pressed={category===c} style={{background:category===c?"#efe2c8":"transparent"}} onClick={()=>setCategory(c)}>{c}</button>)}
  <label style={{marginLeft:"auto",fontSize:12}}>Collection edit <select value={edit} onChange={e=>setEdit(e.target.value)}><option value="all">All collections</option><option value="premium">Premium Collection</option><option value="new">New Arrivals</option></select></label></div>
  <details><summary>Cotton handlooms · Explore regional weaves</summary><div className="toolbar">{cottonWeaves.map(w=><button key={w} className="pill" style={{border:"1px solid var(--line)"}} onClick={()=>{setWeave(w.replace(" Cotton",""));setFabric("Cotton")}}>{w}</button>)}</div><p className="muted">Some traditions are awaiting sample products. The catalog does not yet represent the complete planned collection.</p></details>
  <div className="filterbar"><input aria-label="Search collection" type="search" placeholder="Search by weave or name…" value={query} onChange={e=>setQuery(e.target.value)}/>
   <select aria-label="Filter by fabric" value={fabric} onChange={e=>setFabric(e.target.value)}><option>All fabrics</option><option>Cotton</option><option>Silk</option><option>Cotton-Silk</option><option>Other blends</option></select>
   <select aria-label="Filter by weave" value={weave} onChange={e=>setWeave(e.target.value)}><option>All weaves</option>{weaves.map(w=><option key={w}>{w}</option>)}</select>
   <select aria-label="Sort collection" value={sort} onChange={e=>setSort(e.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select>
   <span className="muted" style={{marginLeft:"auto"}}>{filtered.length} pieces</span>
  </div>
  {filtered.length?<ProductGrid items={filtered}/>:<div className="empty"><span className="eyebrow">More threads to come</span><h2 style={{marginTop:15}}>This weave is still on its way.</h2><p>No sample pieces match these filters. Explore the rest of the collection.</p><button className="btn" onClick={()=>{setQuery("");setFabric("All fabrics");setWeave("All weaves");setCategory("All pieces");setEdit("all")}}>Explore all pieces</button></div>}
  <p className="muted" style={{fontSize:11,marginTop:25}}>Design preview · Illustrative textile swatches, sample products and prices. Final product imagery and catalog await client content.</p>
 </main></Shell>
}
