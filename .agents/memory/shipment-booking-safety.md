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

A configured pickup address and an offered courier rate do not establish that
the downstream carrier's warehouse mapping exists.

**Why:** An authorized assignment returned `ClientWarehouse matching query does
not exist.` even though the order matched an existing Shiprocket pickup record
and courier serviceability returned a rate.

**How to apply:** Treat this error as a warehouse-record/mapping investigation,
not proof of a product restriction. Preserve existing orders and pickup
references; do not change dangerous-goods classifications or create replacement
orders to work around it.

Different courier IDs can represent services from the same underlying carrier,
not an independent fallback.

**Why:** Delhivery courier 44 and 43 were separate Surface service IDs, but
assigning the existing shipment with 43 returned the same ClientWarehouse error.

**How to apply:** Compare the actual carrier names before treating another
service ID as a fallback. Resolve the carrier-side mapping or confirm a different
partner before another live attempt.

A merchant-created clone following Shiprocket support's instructions can replace
a failed shipment on the same paid customer order, after its exact reference,
AWB and courier eligibility are independently verified. Preserve the original
shipment and rejection history; do not repeat payment or inventory actions.

**Why:** The merchant obtained an AWB through a support-directed manual clone
after the original carrier's warehouse-mapping failure. The user confirmed the
replacement Air courier's eligibility; that confirmation was shipment-specific,
not permission to remove Surface-only tags or dangerous-goods classifications.

**How to apply:** Reconcile an already-existing clone without creating another
provider order or assigning another AWB. Do not generalize a replacement
courier's eligibility to future shipments.
