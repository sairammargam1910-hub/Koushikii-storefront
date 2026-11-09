-- Shiprocket quotes are rate-only; provider order references are created after payment.
ALTER TABLE cashfree_checkout_shipment_packages
  ALTER COLUMN shiprocket_order_id DROP NOT NULL;
