---
name: Shiprocket webhooks
description: Shiprocket tracking callback authentication and URL constraints.
---

Shiprocket's official webhook guide says its configured security token is sent in the `x-api-key` header. The webhook callback URL should avoid provider-related keywords such as `shiprocket`, `kartrocket`, `sr`, and `kr`; valid deliveries should receive HTTP 200.

**Why:** Shiprocket documents these requirements as conditions for callback delivery. A provider-named URL or a different authentication header can prevent the tracking event from reaching the application.

**How to apply:** Keep the callback path provider-neutral, compare `x-api-key` to a secret stored outside source code, and acknowledge valid/ignored callbacks with HTTP 200. Do not log the token or raw provider payload.
