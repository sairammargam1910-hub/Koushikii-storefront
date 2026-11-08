---
name: Cashfree cross-device payment
description: Preserve QR-based payment confirmation when the shopper pays on another device.
---

Keep the storefront checkout page active while Cashfree is open in a modal, and poll the server for verified payment status. A browser redirect or a closed payment window is not proof of payment; Shopify order sync and shipment eligibility must remain gated on the server's verified `PAID` state.

**Why:** Shoppers may scan a QR code on a second device while the original checkout page remains open. Navigating the original page away from the storefront prevents it from showing payment confirmation promptly.

**How to apply:** When changing Cashfree checkout behavior, preserve a page that can poll the existing payment-status endpoint. Treat webhook or server-to-server Cashfree verification as authoritative, and never create or fulfill an order from frontend return data alone.
