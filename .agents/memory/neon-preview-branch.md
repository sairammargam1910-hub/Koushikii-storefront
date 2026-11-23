---
name: Neon preview branch
description: The Neon branch used by the Replit preview and its separation from live main.
---

Replit's development API connects to the `cashfree-checkout-dev` Neon branch. Neon `main` is a separate default branch used for live data.

**Why:** The application connects through `NEON_DEV_DATABASE_URL` in development, and the Neon project confirmed a distinct `cashfree-checkout-dev` branch alongside default `main`.

The Neon MCP prepare/complete migration pair defaults to `main` and has no target-branch parameter. A completed prepared migration can therefore update live schema even when the app uses a preview branch.

**Why:** A preview-only migration was completed against the default branch because the helper did not accept a branch selector.

**How to apply:** For preview-only schema changes, test on a temporary branch forked from `cashfree-checkout-dev`, then use `runSqlTransaction` with that branch's explicit ID after user approval. Verify both preview and live branch schemas before reporting; never assume the prepared migration follows the app's database URL.
