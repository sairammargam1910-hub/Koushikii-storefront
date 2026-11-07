---
name: Cashfree account readiness
description: Merchant-confirmed Cashfree international payment and settlement facts, plus the current storefront currency boundary.
---

The merchant confirmed that Cashfree International Cards are enabled, payment currencies include INR and USD plus other unspecified currencies, and settlement currency is INR. The full account currency list was not provided.

The storefront's current Shopify order-sync path accepts INR only. Its production checkout remains in sandbox and must stay disabled for live payments until the merchant separately approves activation.

**Why:** On 2026-11-07, the merchant confirmed Cashfree account facts while preparing international delivery and payment readiness.

**How to apply:** Keep the application allowlist restricted to INR while Shopify order sync is INR-only. Do not infer the full currency list from “etc” or enable USD checkout without verified currency handling, matching settlement logic, and Shopify order synchronization.
