---
name: Shopify checkout return
description: Distinguishes Shopify's generated checkout URL from the storefront destination used when leaving checkout.
---

Do not rewrite the hostname of Shopify's `Cart.checkoutUrl`; Shopify generates this checkout link and its cart key is private. If a customer starts on Railway, enters a `myshopify.com` checkout, then lands on the old Replit site, the return target is not the Shopify primary domain. Check which Shopify Headless storefront/token is used and where its checkout/storefront return flow points.

**Why:** The Railway storefront was confirmed to use a Replit-created Storefront API token. A Railway-started checkout used Shopify's host but eventually returned to the Replit storefront while Shopify's primary domain remained `myshopify.com`.

**How to apply:** Before production handoff, verify the storefront/token and return destination for each hosting environment. Treat trial checkout activation and payment-provider setup as a separate prerequisite.
