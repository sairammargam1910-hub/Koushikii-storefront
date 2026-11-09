---
name: Shipment booking safety
description: Product eligibility and explicit approval requirements for carrier booking.
---

Keep shipments with unresolved product eligibility on hold. Do not remove a dangerous-goods flag or assign an AWB merely because a shipping quote is available. Confirm carrier acceptance and obtain final user approval before booking.

**Why:** The user explicitly requires eligibility verification before any live AWB assignment; a rate quote and invoice do not establish courier acceptance.

**How to apply:** Preserve existing provider references, investigate through read-only operations first, and never create a replacement order or retry an ambiguous booking response to bypass the hold.

Capture sanitized courier remarks from the authorized AWB response before the
process exits. Read-only order/shipment APIs may not expose the rejected call's
`rmk` or package remarks afterward.

**Why:** A failed assignment returned HTTP 200 with explicit rejection flags,
but subsequent GET records did not contain its detailed rejection text.

**How to apply:** Keep the response's sanitized business outcome and remarks
together. Never repeat an assignment just to recover missing diagnostics.
