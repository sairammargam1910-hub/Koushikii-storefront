import { useEffect } from "react";
import { base } from "./_shared";

// Legacy URL only. CustomerCare replaces the combined FAQ/care page.
// Do not add this compatibility route as a canvas page.
export function Help() {
 useEffect(() => { window.location.replace(base + "CustomerCare"); }, []);
 return <div className="kq"><main className="wrap content"><p>Our help pages have moved to <a className="link" href={base+"CustomerCare"}>Customer care</a>.</p></main></div>;
}
