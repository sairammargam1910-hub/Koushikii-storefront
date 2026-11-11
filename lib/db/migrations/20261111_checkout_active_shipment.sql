ALTER TABLE cashfree_checkout_shipment_packages
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
