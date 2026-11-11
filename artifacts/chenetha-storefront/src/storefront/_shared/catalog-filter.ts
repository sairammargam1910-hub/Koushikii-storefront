/** Pure catalog filtering. Region assignments are illustrative, not provenance certification. */
export const regions: Record<string,string> = {
 an:"Andaman and Nicobar Islands",ap:"Andhra Pradesh",ar:"Arunachal Pradesh",as:"Assam",br:"Bihar",
 ch:"Chandigarh",ct:"Chhattisgarh",dn:"Dadra and Nagar Haveli",dd:"Daman and Diu",dl:"Delhi",
 ga:"Goa",gj:"Gujarat",hr:"Haryana",hp:"Himachal Pradesh",jk:"Jammu and Kashmir",jh:"Jharkhand",
 ka:"Karnataka",kl:"Kerala",ld:"Lakshadweep",mp:"Madhya Pradesh",mh:"Maharashtra",mn:"Manipur",
 ml:"Meghalaya",mz:"Mizoram",nl:"Nagaland",or:"Odisha",py:"Puducherry",pb:"Punjab",rj:"Rajasthan",
 sk:"Sikkim",tn:"Tamil Nadu",tg:"Telangana",tr:"Tripura",up:"Uttar Pradesh",ut:"Uttarakhand",wb:"West Bengal",
 la:"Ladakh",dh:"Dadra and Nagar Haveli and Daman and Diu",
};
const aliases:Record<string,string>={ts:"tg",od:"or",cg:"ct",uk:"ut",telangana:"tg","tamil nadu":"tn","andhra pradesh":"ap","uttar pradesh":"up","west bengal":"wb","jammu & kashmir":"jk","jammu and kashmir":"jk",manipur:"mn",orissa:"or",pondicherry:"py",uttaranchal:"ut"};
export function normalizeRegion(value:string):string {
 const key=value.trim().toLowerCase();
 return aliases[key] || Object.entries(regions).find(([,name])=>name.toLowerCase()===key)?.[0] || key;
}
export function normalizeWeave(value:string):string {
 const key=value.trim().replace(/ Cottons?$/i,"");
 const aliases:Record<string,string>={"pochampally":"Ikat","pochampally ikat":"Ikat","kanchipooram":"Kanchipuram","kanchipooram silk":"Kanchipuram","kanchipuram silk":"Kanchipuram","banaras":"Banarasi","banaras cottons":"Banarasi","banaras cotton":"Banarasi"};
 return aliases[value.toLowerCase()] || aliases[key.toLowerCase()] || key;
}
export interface CatalogFilters {query:string;fabric:string;weave:string;category:string;productType:string;region:string;colour:string;collection:string;edit:string;sort:string}
export const defaultFilters:CatalogFilters={query:"",fabric:"All fabrics",weave:"All weaves",category:"All products",productType:"",region:"",colour:"",collection:"",edit:"all",sort:"Featured"};
export interface CatalogPiece {name:string;type:string;weave:string;fabric:string;price:number;tag:string;region:string}
export function filterCatalog<T extends CatalogPiece>(items:T[],f:CatalogFilters):T[] {
 const region=normalizeRegion(f.region),weave=normalizeWeave(f.weave).toLowerCase();
 const category=f.category.toLowerCase();
 return items.filter(p=>
  (!region||(!!regions[region]&&normalizeRegion(p.region)===region))&&
  (!f.colour&&!f.collection&&!f.productType)&&
  (!f.query||`${p.name} ${p.weave} ${p.fabric} ${p.type}`.toLowerCase().includes(f.query.trim().toLowerCase()))&&
  (f.fabric==="All fabrics"||p.fabric.toLowerCase()===f.fabric.toLowerCase())&&
  (f.weave==="All weaves"||p.weave.toLowerCase()===weave)&&
   (category==="all pieces"||category==="all products"||(category==="sarees"||category==="saree"?p.type.toLowerCase().includes("saree"):category==="dupattas"||category==="dupatta"?p.type.toLowerCase().includes("dupatta"):false))&&
  (f.edit==="all"||(f.edit==="premium"?p.price>=12000:f.edit==="new"?["New arrival","Just arrived","Hand-finished","Everyday"].includes(p.tag):false))
 ).sort((a,b)=>f.sort==="Price: low to high"?a.price-b.price:f.sort==="Price: high to low"?b.price-a.price:0);
}
