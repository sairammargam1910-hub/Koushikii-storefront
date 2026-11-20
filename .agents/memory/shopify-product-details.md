---
name: Shopify product details
description: Storage and content rules for customer-facing, per-piece textile details.
---

Store optional, verified product-specific details in a separate Shopify JSON metafield. Keep existing classification and availability metafields unchanged; blank detail values mean “unknown” and should stay hidden from shoppers.

**Why:** Product-level facts vary by piece and are often sparse. A separate JSON bundle keeps optional details together without changing existing Shopify definitions or treating a category label as proof of composition, origin, or care.

**How to apply:** Extend the typed Shopify API and merchant editor together when adding customer-facing details. Preserve the existing scalar classification fields, omit empty values in the storefront, and never infer a textile fact from the title, handle, or tags.
