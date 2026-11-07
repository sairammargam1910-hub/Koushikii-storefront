---
name: Shopify checkout return
description: Distinguishes Shopify's generated checkout URL from the storefront destination used when leaving checkout.
---

Never rewrite Shopify's `Cart.checkoutUrl` hostname or query parameters. For Railway-connected storefront and order work, use `gtnbsw-x3.myshopify.com`; the Replit `shopify-store` connector points to a different development store. Keep `SHOPIFY_SHOP_DOMAIN` and the Storefront API token paired to the same client store.

**Why:** An earlier Railway checkout returned to the old Replit site because it used a Replit-created Storefront token. The merchant explicitly confirmed that the Railway-connected Shopify store is the source of truth; the matching Replit `shopify` connector is distinct from `shopify-store`.

**How to apply:** When changing stores or hosts, verify the published client product, Shopify checkout host, and return destination without rewriting Shopify's URL. Confirm the Railway app's own permissions, payment, and shipping setup separately; a matching connector's scopes do not prove the Railway app uses the same installation.
