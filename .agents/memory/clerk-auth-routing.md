---
name: Clerk redirect routing
description: Clerk can normalize redirects while switching between sign-in and sign-up screens.
---

When handling Clerk's `redirect_url`, accept safe root-relative paths and absolute URLs only when their origin matches the current site. Convert same-origin URLs back to internal paths before applying the artifact base path; reject external destinations.

**Why:** Switching between Clerk sign-in and sign-up screens can rewrite a relative destination such as `/admin` into an absolute same-origin URL. Rejecting that URL loses the original destination and falls back to the shopper account.

**How to apply:** Preserve the safe destination across auth-screen links, normalize it at the route boundary, and test both shopper and merchant destinations—including nested artifact base paths.
