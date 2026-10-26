import { useId } from "react";

// Knock out the pale ground of the supplied red logo, preserving its original
// pixels and letterforms. Alpha comes from the inverse green channel, not from
// a blend mode: the result is a genuinely transparent cream silhouette.
export function LogoSilhouette() {
 const id = "kq-logo-" + useId().replace(/:/g, "");
 return <svg className="footer-logo" viewBox="0 0 1024 219" role="img" aria-label="Chenetha by Koushikii">
  <defs><filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
   <feColorMatrix type="matrix" values="0 0 0 0 .969  0 0 0 0 .945  0 0 0 0 .902  0 -1.18 0 0 1.15"/>
  </filter></defs>
  <image href="/images/koushikii/wordmark-red.png" width="1024" height="219" filter={`url(#${id})`}/>
 </svg>;
}
