---
name: Shopper preference persistence
description: Account-backed wishlist and profile preferences while preserving guest browsing.
---

Keep signed-in shopper preferences private to the authenticated Clerk user; the API must derive ownership from the verified session and never accept a shopper ID from the client. Guest wishlist and profile data stay in browser storage and remain separate from account data.

**Why:** Shoppers may share a browser or device. Automatically moving browser-local details into whichever account signs in could mix different people's data.

**How to apply:** Keep account changes scoped to the signed-in user and refresh them when the account view is revisited or the browser regains focus. If guest-to-account transfer is added, make it an explicit, user-confirmed merge.
