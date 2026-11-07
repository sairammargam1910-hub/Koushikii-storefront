---
name: External hosting decisions
description: User-approved hosting scope, deferred custom domain, and the Clerk account boundary.
---

Host both the storefront and API on Railway, with Neon Postgres and Cloudflare R2 for persistence. The custom domain `koushikii.com` is now connected to Railway; keep the Replit copy during verification.

**Why:** The user selected Railway for both app services, then requested the custom domain after testing.

**How to apply:** Keep Replit intact during migration and verify the external deployment after changes before retiring any source service.

A GitHub push is not proof that Railway has deployed the new version. Before saying a change is live, verify Railway's active deployment is built from the intended GitHub commit and smoke-test the storefront and API on the custom domain.

**Why:** The user expects Railway to serve the latest storefront while the Replit copy remains available during verification.

**How to apply:** After a source push, check Railway deployment status and test the public flow before reporting that production is updated. If Railway's status API denies read access, compare the remote Git ref with the pushed commit and smoke-test the public bundle and API readiness endpoint; report that this verifies the app responds but does not expose Railway's exact deployment revision. A push can reach the remote even if the Replit Git wrapper then blocks updating the local remote-tracking ref, so verify the remote ref before treating a nonzero push exit as a failed push.

The user approved using new, independent Clerk accounts for the external site after being told that Replit-managed Clerk cannot be hosted externally or export its users. Existing accounts, profile/address preferences, and wishlists are not promised to transfer.

**Why:** On 2026-11-05, the user explicitly selected “Proceed with new Clerk accounts” after the account and preference implications were explained.

**How to apply:** Do not delete existing Replit accounts or silently represent them as migrated. Configure independent Clerk for Railway and make the need to register again clear during handover.

For Shopify Dev Dashboard apps, requested permissions, released app configuration, and the store's approved installation permissions are separate. A process restart refreshes cached authorization but cannot grant missing permissions.

**Why:** Shopify continued rejecting location access after a reported permission approval and a fresh Railway process. Shopify's documentation confirms that releasing a new app version does not automatically approve its scopes on installed stores.

**How to apply:** When permission errors persist, verify the active released version and the exact installed app's approved scopes before repeating restarts. Do not treat a successful token refresh or working public catalog as proof that merchant permissions are correct.

Keep Railway's canonical app origin aligned with the domain used for merchant sign-in. Validate the startup contract as well as the API middleware before changing an origin setting.

**Why:** After moving to the custom domain, Clerk rejected merchant sessions whose authorized party was the custom domain while the backend still expected the generated Railway hostname. An attempted comma-separated origin list then failed the startup validator, despite the API middleware supporting lists.

**How to apply:** Use the single canonical custom-domain origin unless multi-origin support is implemented and validated end to end. A working public Shopify catalog does not prove authenticated merchant requests are accepted.

Cloudflare R2 browser uploads require the live storefront origin in the bucket's CORS policy; successful upload-URL signing alone does not prove the browser's file transfer can pass.

**Why:** The bucket allowed the generated Railway hostname but not `https://koushikii.com`, so upload signing succeeded while browser uploads from the custom domain were blocked at CORS preflight.

**How to apply:** After changing the storefront domain, preserve existing R2 CORS rules and add the exact new HTTPS origin. Verify an `OPTIONS` request for `PUT` from that origin before testing an authenticated upload.
