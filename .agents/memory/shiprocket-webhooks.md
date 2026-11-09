---
name: Shiprocket webhooks
description: Shiprocket tracking callback authentication and URL constraints.
---

Shiprocket's official webhook guide says its configured security token is sent in the `x-api-key` header. The webhook callback URL should avoid provider-related keywords such as `shiprocket`, `kartrocket`, `sr`, and `kr`; valid deliveries should receive HTTP 200.

**Why:** Shiprocket documents these requirements as conditions for callback delivery. A provider-named URL or a different authentication header can prevent the tracking event from reaching the application.

**How to apply:** Keep the callback path provider-neutral, compare `x-api-key` to a secret stored outside source code, and acknowledge valid/ignored callbacks with HTTP 200. Do not log the token or raw provider payload.

Shiprocket's dashboard message “unable to send request” does not establish a connectivity failure; it also appears when a reachable callback returns HTTP 400.

**Why:** Production request logs showed dashboard tests reaching the service and failing reference validation while the downloaded sample was accepted.

**How to apply:** Verify the HTTP status and sanitized validation reason before changing URLs, authentication, or parser rules. Do not assume the dashboard test request equals its downloadable sample.
