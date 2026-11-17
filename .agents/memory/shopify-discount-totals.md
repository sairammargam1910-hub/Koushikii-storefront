---
name: Shopify order-level discounts
description: Order-wide coupons can leave every line cost unchanged; use cart allocations and preserve paid-line totals.
---
Read Shopify's cart-level discount allocations as well as product-line allocations. Never infer merchandise savings solely from line cost differences or the code's applicable flag.

**Why:** A live NEW26 cart returned an applicable coupon and a ₹200 cart-level allocation, while its ₹2,000 line cost and line allocations were unchanged. Reading lines alone falsely displayed zero savings.

**How to apply:** Verify changed pricing against an actual Storefront response, not only fixtures. Allocate order-level merchandise savings to paid lines with exact minor-unit rounding, consistently for bag totals, shipping declarations, payment, order creation and reconciliation. Exclude shipping-targeted discounts from merchandise totals.
