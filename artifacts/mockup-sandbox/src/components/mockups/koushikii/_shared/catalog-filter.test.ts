import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultFilters, filterCatalog, normalizeRegion, normalizeWeave, regions } from "./catalog-filter.ts";

// Read the actual sample catalog without importing React, styles or browser code.
const source=readFileSync(new URL("../_shared.tsx",import.meta.url),"utf8");
const literal=source.match(/export const products=(\[[\s\S]*?\n\]);/)?.[1];
assert.ok(literal,"sample catalog declaration found");
// Current catalog has JSON-compatible scalar fields with unquoted identifier keys.
const catalog=JSON.parse(literal.replace(/([{,])(\w+):/g,'$1"$2":').replace(/,\s*]/g,"]"));
const ids=(filters:Partial<typeof defaultFilters>)=>filterCatalog(catalog,{...defaultFilters,...filters}).map((p:any)=>p.id);

test("actual sample catalog has explicit region metadata",()=>{
 const expected={surya:"tn",mira:"tg",indigo:"ap",ambar:"up",nila:"tg",gulmohar:"wb",noor:"jk",rekha:"mn"};
 for(const [id,region] of Object.entries(expected))assert.equal(catalog.find((p:any)=>p.id===id)?.region,region);
});
test("state and saree selection is strict",()=>{
 assert.deepEqual(ids({region:"tn",category:"Sarees"}),["surya"]);
 assert.deepEqual(ids({region:"tg",category:"Sarees"}),["nila","mira"]);
 assert.deepEqual(ids({region:"ap",category:"Sarees"}),["indigo"]);
 assert.deepEqual(ids({region:"up",category:"Sarees"}),["ambar"]);
 assert.deepEqual(ids({region:"wb",category:"Sarees"}),["gulmohar"]);
 for(const region of ["jk","mn","kl","invalid-state"])assert.deepEqual(ids({region,category:"Sarees"}),[]);
});
test("other filters intersect with region, never substitute",()=>{
 assert.deepEqual(ids({region:"tg",category:"Sarees",fabric:"Cotton"}),["mira"]);
 assert.deepEqual(ids({region:"tg",category:"Sarees",weave:"Pochampally Ikat"}),["nila"]);
 assert.deepEqual(ids({region:"tg",category:"Sarees",query:"Surya"}),[]);
 assert.deepEqual(ids({region:"tg",category:"Sarees",weave:"Kanchipuram"}),[]);
 assert.deepEqual(ids({region:"tn",category:"Dupattas"}),[]);
 assert.deepEqual(ids({region:"ap",edit:"premium"}),[]);
 assert.deepEqual(ids({region:"tg",sort:"Price: low to high"}),["mira","nila"]);
});
test("invalid categories, weave and edits do not show all pieces",()=>{
 assert.deepEqual(ids({category:"garbage"}),[]);
 assert.deepEqual(ids({weave:"nonexistent"}),[]);
 assert.deepEqual(ids({edit:"nonexistent"}),[]);
});
test("region aliases and full names are normalized",()=>{
 for(const [alias,code] of Object.entries({TS:"tg",od:"or",cg:"ct",uk:"ut","Tamil Nadu":"tn",Telangana:"tg",Orissa:"or",Uttaranchal:"ut","Jammu & Kashmir":"jk"}))assert.equal(normalizeRegion(alias),code);
 for(const [code,name] of Object.entries(regions))assert.equal(normalizeRegion(name),code);
 assert.deepEqual(ids({region:" TS ",category:"Sarees"}),["nila","mira"]);
 assert.equal(normalizeWeave("Banaras Cottons"),"Banarasi");
});
test("every map region resolves to a collection region name",()=>{
 const html=readFileSync(new URL("./client-reference.html",import.meta.url),"utf8");
 const template=html.match(/<script[^>]*type=["']__bundler\/template["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(template);
 const script=JSON.parse(template);
 const names=JSON.parse(script.match(/names\(\)\s*\{\s*return\s*(\{[\s\S]*?\});\s*\}/)[1]);
 for(const [code,name] of Object.entries(names)){
  assert.ok(regions[normalizeRegion(code)],"missing map region "+code);
  assert.equal(normalizeRegion(String(name)),normalizeRegion(code),"map alias for "+name);
 }
});
test("reset returns the complete catalog",()=>assert.equal(ids({}).length,catalog.length));
