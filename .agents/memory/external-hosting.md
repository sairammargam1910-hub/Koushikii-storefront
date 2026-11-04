---
name: External hosting decisions
description: User-approved hosting scope, deferred custom domain, and the Clerk account boundary.
---

Host both the storefront and API on Railway, with Neon Postgres and Cloudflare R2 for persistence. Use Railway-generated URLs initially; do not connect the custom domain or change DNS until the user explicitly requests it after testing.

**Why:** The user selected Railway for both app services and said they will connect the domain after everything is working.

**How to apply:** Keep Replit intact during migration and verify the external deployment before retiring any source service.

The user approved using new, independent Clerk accounts for the external site after being told that Replit-managed Clerk cannot be hosted externally or export its users. Existing accounts, profile/address preferences, and wishlists are not promised to transfer.

**Why:** On 2026-11-05, the user explicitly selected “Proceed with new Clerk accounts” after the account and preference implications were explained.

**How to apply:** Do not delete existing Replit accounts or silently represent them as migrated. Configure independent Clerk for Railway and make the need to register again clear during handover.
