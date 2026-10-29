---
name: Artifact workflow port recovery
description: Recover artifact workflows when a restart collides with a stale listener.
---

When a managed artifact workflow restart fails with `EADDRINUSE` but its previous server still answers requests, stop the managed workflow and confirm the port is clear before restarting it. Do not work around the collision by changing the artifact's injected port.

**Why:** A restart can fail while a prior server process still owns the artifact port; stopping the managed service cleared the stale listener and allowed a clean restart.

**How to apply:** Check workflow logs, port listeners, and HTTP health first. Use the workflow stop action before retrying a failed artifact restart.
