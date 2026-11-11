---
name: Shopify classification storage
description: Non-destructive storage and compatibility rules for Chenetha product classification values.
---

Keep existing Shopify single-line product metafield definitions. Save one classification value as its existing plain scalar string and multiple values as a JSON string array; read both forms so products already classified before this feature continue to work.

**Why:** Changing metafield definitions or converting existing values would require a data migration and could disrupt published product details. JSON arrays add multi-value support while retaining old scalar values.

**How to apply:** Reuse the scalar-or-JSON parser and serializer for product classification reads and writes. Do not switch Shopify metafield types without a separate, data-preserving migration plan and approval.
