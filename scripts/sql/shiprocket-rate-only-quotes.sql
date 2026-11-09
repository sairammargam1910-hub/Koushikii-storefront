-- Quotes do not create a Shiprocket order. Preserve existing references and uniqueness.
ALTER TABLE cashfree_checkout_shipment_packages
  ALTER COLUMN shiprocket_order_id DROP NOT NULL;
