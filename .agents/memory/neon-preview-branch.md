---
name: Neon preview branch
description: The Neon branch used by the Replit preview and its separation from live main.
---

Replit's development API connects to the `cashfree-checkout-dev` Neon branch. Neon `main` is a separate default branch used for live data.

**Why:** The application connects through `NEON_DEV_DATABASE_URL` in development, and the Neon project confirmed a distinct `cashfree-checkout-dev` branch alongside default `main`.

**How to apply:** Apply preview-only schema changes to `cashfree-checkout-dev`. Do not change the default/live branch or report a production update unless the user explicitly authorizes it.
