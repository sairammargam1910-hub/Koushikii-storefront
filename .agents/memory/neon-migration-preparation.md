---
name: Neon migration preparation
description: Preparing PostgreSQL migrations through Neon’s temporary-branch workflow.
---

Neon’s prepared-migration flow can reject dollar-quoted `DO` blocks that contain internal semicolons. When this happens, use an equivalent plain SQL sequence on the temporary branch, confirm the target objects are absent, and test the resulting schema and data before applying it to the parent branch.

**Why:** The migration preparation call split a dollar-quoted block and PostgreSQL reported an unterminated string; equivalent standalone statements prepared and passed verification.

**How to apply:** Preserve the project’s normal idempotent migration file. For the Neon temporary-branch flow, adapt only the prepared SQL when the production baseline confirms the types do not yet exist, validate the full result, and require explicit user approval before applying it to the parent branch.
