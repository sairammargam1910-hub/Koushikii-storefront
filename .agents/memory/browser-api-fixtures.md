---
name: Browser API fixtures
description: Reliable Playwright network mocking for storefront components with eager queries.
---
Browser tests must register API route mocks before navigating when the mounted component fetches data on first render. Storefront fixtures need ClerkProvider, Wouter Router, and ShopperPreferencesProvider.

**Why:** Requests issued before navigation settles can escape later-installed mocks and make a gallery appear empty or depend on a live endpoint. Storefront pages rely on Clerk, Wouter, and shopper preference context; omitting a provider can crash the fixture before page content renders.

**How to apply:** Register fixture responses in the browser setup callback before `page.goto`; keep all storefront/admin API traffic inside the test boundary. Wrap storefront fixtures in the same three providers as the app. When a tested flow changes routes (for example, checkout returning to order confirmation), mount the destination route in the fixture and keep the same providers there; otherwise the fixture can hide a valid navigation or falsely report a blank page.
