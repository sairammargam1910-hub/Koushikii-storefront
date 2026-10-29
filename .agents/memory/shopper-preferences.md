---
name: Shopper preference persistence
description: Account-backed wishlist and profile preferences while preserving guest browsing.
---

Keep signed-in shopper preferences private to the authenticated Clerk user; the API must derive ownership from the verified session and never accept a shopper ID from the client. Guest wishlist and profile data stay in browser storage and remain separate from account data.

**Why:** Shoppers may share a browser or device. Automatically moving browser-local details into whichever account signs in could mix different people's data.

**How to apply:** Keep account changes scoped to the signed-in user and refresh them when the account view is revisited or the browser regains focus. If guest-to-account transfer is added, make it an explicit, user-confirmed merge.

For profile-prefill checkout, send saved contact details as buyer identity and the selected delivery address as a one-time cart address, only after the shopper explicitly chooses that checkout action. Shopify may recalculate delivery and taxes when an address is attached, so the cart total can differ from the discounted merchandise subtotal.

**Why:** Shopify Storefront API 2026-04 separates buyer identity from cart delivery addresses; a one-time cart address avoids silently changing the customer's saved Shopify address book. Address-based delivery estimates can also affect the displayed payable amount.

**How to apply:** Verify the live Storefront schema when updating checkout mutations, preserve guest/account separation, and label cart totals as estimates until Shopify's hosted checkout confirms shipping, taxes, and payment.
