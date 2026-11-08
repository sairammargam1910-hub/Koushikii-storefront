---
name: Cashfree account readiness
description: Merchant-confirmed Cashfree international payment and settlement facts, plus the current storefront currency boundary.
---

The merchant confirmed that Cashfree International Cards are enabled, payment currencies include INR and USD plus other unspecified currencies, and settlement currency is INR. The full account currency list was not provided.

The storefront's current Shopify order-sync path accepts INR only. Its production checkout remains in sandbox and must stay disabled for live payments until the merchant separately approves activation.

**Why:** On 2026-11-07, the merchant confirmed Cashfree account facts while preparing international delivery and payment readiness.

**How to apply:** Keep the application allowlist restricted to INR while Shopify order sync is INR-only. Do not infer the full currency list from “etc” or enable USD checkout without verified currency handling, matching settlement logic, and Shopify order synchronization.

### Cashfree order expiry

The merchant confirmed on 2026-11-08 that sandbox checkout opens with a 20-minute Cashfree order expiry while the quote-start window remains 10 minutes.

**Why:** Cashfree rejected an order expiry derived from the 10-minute quote with `order_expiry_time_invalid`; its response requires more than 15 minutes. The 20-minute payment-session expiry was verified by a successful sandbox session, not a live payment.

**How to apply:** Keep the quote-start window and Cashfree payment-session expiry separate. Preserve sandbox mode and do not interpret this confirmation as approval for live payments.
