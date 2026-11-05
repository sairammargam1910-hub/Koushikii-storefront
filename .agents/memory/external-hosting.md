---
name: External hosting decisions
description: User-approved hosting scope, deferred custom domain, and the Clerk account boundary.
---

Host both the storefront and API on Railway, with Neon Postgres and Cloudflare R2 for persistence. The custom domain `koushikii.com` is now connected to Railway; keep the Replit copy during verification.

**Why:** The user selected Railway for both app services, then requested the custom domain after testing.

**How to apply:** Keep Replit intact during migration and verify the external deployment after changes before retiring any source service.

The user approved using new, independent Clerk accounts for the external site after being told that Replit-managed Clerk cannot be hosted externally or export its users. Existing accounts, profile/address preferences, and wishlists are not promised to transfer.

**Why:** On 2026-11-05, the user explicitly selected “Proceed with new Clerk accounts” after the account and preference implications were explained.

**How to apply:** Do not delete existing Replit accounts or silently represent them as migrated. Configure independent Clerk for Railway and make the need to register again clear during handover.

For Shopify Dev Dashboard apps, requested permissions, released app configuration, and the store's approved installation permissions are separate. A process restart refreshes cached authorization but cannot grant missing permissions.

**Why:** Shopify continued rejecting location access after a reported permission approval and a fresh Railway process. Shopify's documentation confirms that releasing a new app version does not automatically approve its scopes on installed stores.

**How to apply:** When permission errors persist, verify the active released version and the exact installed app's approved scopes before repeating restarts. Do not treat a successful token refresh or working public catalog as proof that merchant permissions are correct.

Keep Railway's canonical app origin aligned with the domain used for merchant sign-in. Validate the startup contract as well as the API middleware before changing an origin setting.

**Why:** After moving to the custom domain, Clerk rejected merchant sessions whose authorized party was the custom domain while the backend still expected the generated Railway hostname. An attempted comma-separated origin list then failed the startup validator, despite the API middleware supporting lists.

**How to apply:** Use the single canonical custom-domain origin unless multi-origin support is implemented and validated end to end. A working public Shopify catalog does not prove authenticated merchant requests are accepted.
