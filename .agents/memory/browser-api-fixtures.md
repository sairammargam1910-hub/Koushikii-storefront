---
name: Browser API fixtures
description: Reliable Playwright network mocking for storefront components with eager queries.
---
Browser tests must register API route mocks before navigating to the fixture when the mounted component fetches data on first render.

**Why:** Requests issued before navigation settles can escape later-installed mocks and make a gallery appear empty or depend on a live endpoint.

**How to apply:** Register fixture responses in the browser setup callback before `page.goto`; keep all storefront/admin API traffic inside the test boundary.
