DO $$ BEGIN
  CREATE TYPE checkout_payment_status AS ENUM (
    'not_started',
    'pending',
    'paid',
    'failed',
    'refund_pending',
    'refunded',
    'reconciliation_required'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE checkout_cart_cleanup_status AS ENUM (
    'not_started',
    'processing',
    'completed',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE cashfree_checkout_orders
  ADD COLUMN IF NOT EXISTS payment_status checkout_payment_status
    NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS purchased_cart_lines jsonb
    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cart_cleanup_status checkout_cart_cleanup_status
    NOT NULL DEFAULT 'not_started';

UPDATE cashfree_checkout_orders
SET payment_status = CASE
  WHEN status = 'payment_pending' THEN 'pending'::checkout_payment_status
  WHEN status = 'payment_failed' THEN 'failed'::checkout_payment_status
  WHEN status IN (
    'paid',
    'shopify_sync_pending',
    'shopify_synced',
    'shipment_booking_pending',
    'completed'
  ) THEN 'paid'::checkout_payment_status
  WHEN status = 'refund_pending' THEN 'refund_pending'::checkout_payment_status
  WHEN status = 'refunded' THEN 'refunded'::checkout_payment_status
  WHEN status = 'reconciliation_required' THEN
    CASE WHEN paid_at IS NOT NULL
      THEN 'paid'::checkout_payment_status
      ELSE 'reconciliation_required'::checkout_payment_status
    END
  ELSE 'not_started'::checkout_payment_status
END;

ALTER TABLE cashfree_checkout_shipment_packages
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS tracking_events jsonb
    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_updated_at timestamptz;
