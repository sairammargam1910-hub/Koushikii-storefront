# Railway migration and handover

## Scope and safety

One Railway Node service serves the built React/Vite storefront and `/api` on the
same generated Railway URL. Neon holds Postgres data; a **private** R2 bucket holds
merchant-uploaded site images/videos. Shopify remains authoritative for products,
discounts, inventory, orders, payments, shipping, and checkout.

Do not attach the business's custom domain, change DNS, or stop Replit yet.
Use the Railway-generated URL for testing. Connect the custom domain only after
the owner explicitly requests it and accepts the verification results.

**Accounts:** the owner approved new independent Clerk accounts. Replit-managed
Clerk users and private profile/address/wishlist metadata are not exported by
this migration. Leave the old accounts intact. Users and merchants must register
on the independent app; do not represent old accounts as migrated.

## 1. Provider setup

- Railway: one service with this GitHub repository, `main`, root directory `/`,
  configuration file `/railway.json`, Railpack builder, and one generated service
  domain routed to port `3000`. Do not deploy the mockup sandbox.
- Neon: dedicated Postgres project, Singapore region, with the existing content
  schema. Use its TLS-enabled **pooled** connection string as `DATABASE_URL`.
- Cloudflare R2: activate R2 in the owner's account if needed. Use a private
  Standard bucket named `koushikii-media` in APAC. Do not enable public access or
  its `r2.dev` URL.
- Independent Clerk: create a new Clerk application in the owner's personal
  Clerk account, not the old Replit-managed tenant. Enable the required
  email/password registration and password-reset flows.

For the initial generated-hostname test, use an independent Clerk development
instance. A Clerk production instance normally requires domain verification:
that is a separate, later custom-domain step, not a reason to repurpose the
managed tenant or claim that the temporary site is production-ready.

## 2. Railway variables

Use Railway's service → Variables panel. `.env.example` is a name-only template;
do not put real values in Git, screenshots, chat, or this document. Connections
granted to Replit do **not** automatically supply credentials to Railway.

| Variable | Where it comes from |
| --- | --- |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | Exact generated HTTPS Railway URL, no trailing `/` |
| `DATABASE_URL` | Neon Connect → pooled connection string, retain TLS parameters |
| `CLERK_PUBLISHABLE_KEY` | Independent Clerk instance's publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same independent publishable key; needed at **build** time |
| `CLERK_SECRET_KEY` | Matching independent Clerk instance's secret key; server only |
| `MERCHANT_ADMIN_EMAIL` | Comma-separated verified merchant email(s) |
| `R2_ENDPOINT` | Bucket's S3 API endpoint |
| `R2_BUCKET_NAME` | `koushikii-media` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 account API token with Object Read & Write restricted to this bucket |
| `SHOPIFY_SHOP_DOMAIN` | Store's permanent `*.myshopify.com` hostname, without scheme or path |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Public Storefront token for the selected Headless storefront |
| `SHOPIFY_PUBLICATION_ID` | The matching Shopify publication's `gid://shopify/Publication/...` ID |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Installed Dev Dashboard app owned by the store's organization |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Alternative only for a valid legacy custom-app Admin token; not needed with client credentials |

The start/build scripts select external Clerk, direct Shopify, R2, and combined
static hosting automatically. Do not copy Replit connector identity variables,
the Replit-managed Clerk secret, or App Storage sidecar settings into Railway.

New Shopify Dev Dashboard apps owned by the store's organization can use the
client-credentials grant. The API caches the expiring token and refreshes it
before expiry or once after a 401. An app in a different organization may require
another Shopify-approved OAuth installation flow; this repository does not
implement that flow. Do not assume an existing Replit connector token is portable.

Required Shopify access must cover products, inventory, locations, discounts, and
publications used by this dashboard. Review the exact app's granted scopes:
`read_products`, `write_products`, `read_inventory`, `write_inventory`,
`read_locations`, `read_discounts`, `write_discounts`, `read_publications`,
`write_publications`, and product-file scopes if requested by Shopify.
The Storefront token needs product listing/cart/checkout access. Publish
existing products to the **same publication used by the new token**; publication
to the old Replit sales channel alone does not guarantee visibility there.

### R2 browser upload CORS

Allow only the generated Railway origin for `PUT` and `HEAD`; permit
`Content-Type` and `Content-Length` request headers, expose `ETag`, and cache
preflight for 3600 seconds. Do not use `*` origins. Reads still pass through the
application's database-backed media visibility check, including video range
requests; unpublished media is never made public on the bucket.

## 3. Build and run

Railway reads `railway.json`:

- Build: `pnpm run build:railway` (only shared libraries, storefront, and API).
- Start: `pnpm run start:railway`.
- Readiness: `/api/readyz` checks database/schema connectivity.
- Liveness: `/api/healthz`.

The app serves SPA deep links such as `/Cart` and `/admin/content`; unknown API
paths remain JSON 404 responses rather than returning storefront HTML. A change
to `VITE_*` variables requires a fresh build. Never enable CDN caching of
personalized API or private media responses.

## 4. Data migration

Shopify data remains in the existing store; no product/order database copy is
needed. Shopper metadata stays in the old managed Clerk tenant as explained above.
Postgres currently stores editorial site-content rows. Repository-bundled
images/videos are already included in the frontend build.

Before final verification, compare development and published database row counts
and choose the intended source explicitly. Do not assume development is live
production. Production reads must use the supported read-only database export
path, not a writable production connection.

The migration tools below only **read** the source and only write to the external
Neon target and R2 target. Backups go under ignored `/generated-artifacts/` with
restricted file permissions. Do not commit or publish these backups.

For an authorized source connection, set `SOURCE_DATABASE_URL` securely, then:

```sh
pnpm --filter @workspace/scripts run migrate:content export
```

For a new, empty Neon database only, set `NEON_DATABASE_URL` securely:

```sh
pnpm --filter @workspace/scripts run migrate:content schema --apply
pnpm --filter @workspace/scripts run migrate:content import
pnpm --filter @workspace/scripts run migrate:content import --apply
pnpm --filter @workspace/scripts run migrate:content verify
```

Skip `schema` if the target was already initialized. The tools refuse to overwrite
an existing export or a target containing content. Imports use one transaction,
preserve IDs/timestamps, and compare row hashes before committing. A later data
change requires a fresh export to a different file and an explicitly reviewed
sync; do not truncate tables to make a failed migration pass.

While still in the source Replit runtime, use its existing App Storage access
and the target R2 credentials:

```sh
pnpm --filter @workspace/scripts run migrate:media
pnpm --filter @workspace/scripts run migrate:media --apply
pnpm --filter @workspace/scripts run migrate:media --verify
```

These commands use the export's referenced asset IDs, preserve
`/api/site-content/media/<id>` URLs, never delete source objects, and compare
SHA-256 hashes of source and target bytes. Existing target objects are verified,
not overwritten. Custom export filenames can be passed as the first argument
after the command name (before flags). If the source has zero records and zero
referenced uploads, verify that explicitly rather than inventing migration data.

## 5. Verification before handover

- `/api/readyz` returns 200 and public routes, deep links, images, and videos load.
- Register a **new** shopper and merchant, test email verification, password
  reset, sign-in, sign-out, and shopper preferences across reloads.
- The allowlisted merchant can open the workroom; a shopper gets a denied API
  response for merchant-only actions. The header still offers public browsing.
- Publish and unpublish a temporary content item; public API visibility and
  unpublished media access agree with the merchant settings.
- Upload one image and one MP4/WebM, preview drafts privately, then verify
  published playback, seeking/range requests, and removal without exposing drafts.
- Confirm existing real Shopify products/variants, photos, INR amounts returned
  by Shopify, stock updates, discounts, and product publication.
- Add a real available variant, change quantity, apply a known valid coupon,
  and verify Shopify's returned totals. Checkout must reach the existing
  Shopify-hosted checkout and must not navigate back to storefront home.
- Only use Shopify's test-payment mode for a full test order unless the owner
  explicitly approves a real charge. Do not capture payment details in this app.

Record results and remaining blockers; a successful local build or reserved
Railway URL is not proof of a working external deployment.

## 6. Costs, later domain, and rollback

One combined service avoids a second always-running storefront process, but
Railway bills measured memory, CPU, and outbound traffic. Its subscription is not
a hard usage cap. Watch the billing dashboard, set alerts/spending limits where
available, and review actual usage before promising a fixed monthly amount.
Neon and R2 free tiers have storage/compute/request limits. Serving video through
Railway also incurs Railway outbound traffic even though R2 itself has no egress
fee. Consider authenticated short-lived delivery/CDN optimization only as a
separate reviewed change that preserves draft privacy.

Later, after explicit approval: connect the custom domain, update `APP_ORIGIN`,
Clerk instance/domain and redirect settings, the R2 CORS origin, and any Shopify
storefront links. Rebuild and repeat auth/admin/cart/checkout checks. Do not treat
changing one Railway hostname as completing the whole domain migration.

For rollback, leave Replit and its data intact throughout testing. Keep its old
Shopify publication and users while verification is in progress. If Railway
fails, send testers back to the unchanged Replit URL; no DNS rollback is needed
because no custom domain has moved. New independent Clerk accounts do not
automatically exist in the old managed tenant. Content written after the data
snapshot requires reconciliation, not blind restoration.
