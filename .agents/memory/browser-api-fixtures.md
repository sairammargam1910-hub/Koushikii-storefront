---
name: Browser API fixtures
description: Reliable Playwright network mocking for storefront components with eager queries.
---
Browser tests must register API route mocks before navigating when the mounted component fetches data on first render. Fixtures rendering storefront pages also need the app's ClerkProvider and Wouter Router.

**Why:** Requests issued before navigation settles can escape later-installed mocks and make a gallery appear empty or depend on a live endpoint. Shared storefront navigation uses Clerk's `Show` and Wouter's location hooks, so omitting either provider crashes the fixture before page content renders.

**How to apply:** Register fixture responses in the browser setup callback before `page.goto`; keep all storefront/admin API traffic inside the test boundary. Wrap storefront fixtures in both providers so tests exercise the same component context as the app.
