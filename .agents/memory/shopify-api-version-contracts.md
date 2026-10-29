---
name: Shopify API version contracts
description: Check the connected Shopify schema when inventory examples and the pinned API version disagree.
---
Verify stock mutation contracts against the connected store's pinned API version before relying on generic examples.

**Why:** The Shopify skill's inventory examples still used the older compare field and omitted idempotency, while read-only introspection of the connected 2026-04 schema confirmed a breaking compare-and-swap change and mandatory idempotency directive. Mock-only tests would not have caught this.

**How to apply:** Use read-only schema introspection through the connector when changing inventory API versions or writes. Keep stale-quantity rejection and idempotency intact; never opt out of comparison to make an update succeed.

Validate requested GraphQL query cost against Shopify when changing nested connection page sizes.

**Why:** Small fixture catalogs cannot reveal requested-cost failures for large variant/location page sizes. Shopify budgets by requested connection sizes, not just the records that happen to exist.

**How to apply:** Keep nested previews small, paginate remaining inventory separately, and inspect the live API's requested-cost metadata for list, detail and continuation queries.

Do not remove a product's previous photo until Shopify reports the replacement media as `READY`.

**Why:** Shopify media creation can return a processing or failed item without failing the mutation. Removing the existing image immediately can leave the product without a usable photo when the replacement later fails.

**How to apply:** Keep the prior media in place while a replacement is `UPLOADED` or `PROCESSING`; retain it on `FAILED`, and remove it only when the replacement is `READY`.
