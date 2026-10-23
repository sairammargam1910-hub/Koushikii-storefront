import { useEffect } from "react";
import { base } from "../_shared";

/** Retained only for old bookmarks, not a design page or navigation destination. */
export function CompatibilityRedirect({to}:{to:"Collections"|"CustomerCare"|"OurStory"|"Orders"}){
 useEffect(()=>{window.location.replace(base+to)},[to]);
 return <main className="kq"><div className="wrap content"><p>This page is now part of <a className="link" href={base+to}>{to==="OurStory"?"Our story":to==="CustomerCare"?"Customer care":to}</a>.</p></div></main>;
}
