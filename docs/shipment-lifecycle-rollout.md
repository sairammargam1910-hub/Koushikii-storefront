# Shipment lifecycle rollout

## Safety review — 2026-11-09

The migration `lib/db/migrations/20261109_checkout_shipment_lifecycle.sql`
contains eight `ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS`
statements only. It adds pickup_scheduled, picked_up, in_transit,
out_for_delivery, delivered, booking_failed, cancelled and returned.
It does not alter columns, remove enum labels, rewrite rows, change constraints,
delete data or modify external order references.

Target: Neon project `delicate-brook-99123999`, production branch
`br-broad-wind-b31nsq3s`, database `neondb`, PostgreSQL 17.11.
The original enum labels are quoted, booking_pending, booked and failed.

## Isolated verification

The prepared migration succeeded on branch `br-small-forest-b3zc3wl9`,
copied from production. Reapplying it succeeded. Every supported lifecycle value
was accepted by the real shipment status column inside a savepoint; all test
row updates were rolled back.

Before and after fingerprints match for all 18 checkout orders and 18 shipment
packages, including the complete held order rows:

- Orders: `ce3409ba7d8d9f4172a1ea4887d1fba5`
- Packages: `cca52eda1c966d3cf8ee53b85df7bfba`
- Held order: `0fc30f1161a03944aed1b03d412352cb`

Held order #Ord1006:

- Shopify order: `gid://shopify/Order/19012994302172`
- Shiprocket order: `1716900471`
- Shipment: `1712529624`
- Courier selection: `44`, Delhivery Surface 2 Kgs
- Payment: paid; shipment lifecycle: quoted; AWB and tracking URL: absent

No application is connected to the temporary branch. No provider API action
was performed during migration verification.

## Recovery point

Snapshot: `snap-still-pine-b3r77wtg`, named
`pre-shipment-lifecycle-20261109`, created at 2026-11-09T13:08:30Z.
Expires at 2026-12-09T13:30:00Z.

Railway's pre-rollout successful deployment is
`a5f7330a-3e39-44e1-98fd-9eb3c7a1a036`, commit
`9113cdc17e1597bf0de285b51a9192a864c381a9`.

## Rollout sequence

1. Obtain final approval for the tested production migration.
2. Confirm production order/reference fingerprints immediately before applying.
3. Apply the prepared additive migration, then verify enum labels and unchanged
   order/reference fingerprints. The schema must precede new application writes.
4. Ensure SHIPROCKET_LIVE_BOOKING_ENABLED is false for the new deployment.
   Railway OAuth currently exposes variable names, not values; do not assume the
   flag's current value from its existence.
5. Push the reviewed source and verify Railway serves the intended commit.
   The existing Railway service builds and serves both API and storefront.
6. Check public health/readiness, storefront assets, unauthenticated webhook
   rejection, and authenticated shopper route protection.
7. Re-read the held order without calling payment-status recovery, booking,
   Ship Now, order creation or AWB assignment.
8. Verify valid-secret callback processing with an unmatched test payload when a
   secure authenticated test mechanism is available; never print the secret.

Do not enable payments, change dangerous-goods classifications, assign AWBs,
book shipments, schedule pickups or create provider orders.

## Rollback plan

If migration execution fails, do not push new application code. Inspect enum
labels; statements are idempotent, so partial enum additions need no destructive
repair.

If the new application fails, restore Railway's prior successful deployment
while keeping live booking disabled. Leave the additional enum labels in place:
removing PostgreSQL enum labels requires a potentially disruptive type rebuild
and could invalidate newly stored statuses.

For actual data corruption, create an isolated recovery branch from the snapshot
and compare records first. Restore only after explicit authorization. Never
reset production automatically, because that can discard orders created after
the snapshot.

## Prepared migration context

The user approved production application. The prepared migration was applied
successfully to production on 2026-11-09 and its temporary branch was deleted.
All 18 order rows and 18 package rows retained the recorded fingerprints.
All 12 enum labels are present. No order rows or references were changed.

Railway's SHIPROCKET_LIVE_BOOKING_ENABLED was explicitly set to false with
deployment skipped, so it takes effect with the upcoming application rollout.
No payment settings were changed.

Completed migration context:

- migration_id: `3f300502-4fb4-4839-a36c-505f5b574ca8`
- database_name: `neondb`
- project_id: `delicate-brook-99123999`
- temporary_branch_id: `br-small-forest-b3zc3wl9`
- parent_branch_id: `br-broad-wind-b31nsq3s`

Retain the recovery snapshot until its documented expiration. Do not attempt to
complete or discard this migration again; its temporary branch no longer exists.
