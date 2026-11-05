---
name: Shopify checkout return
description: Distinguishes Shopify's generated checkout URL from the storefront destination used when leaving checkout.
---

Never rewrite Shopify's `Cart.checkoutUrl` hostname or query parameters. On Railway, keep `SHOPIFY_SHOP_DOMAIN` and the Storefront API token paired to the same client store; a Replit-created development-store token sends checkout through the wrong store and can return shoppers to the wrong host.

**Why:** An earlier Railway checkout returned to the old Replit site because it used a Replit-created Storefront token. Railway now uses a client-specific token for the client's Shopify store.

**How to apply:** When changing stores or hosts, verify the published client product, Shopify checkout host, and return destination without rewriting Shopify's URL. Confirm payment and shipping setup separately.
