DO $$ BEGIN
  CREATE TYPE cashfree_checkout_status AS ENUM (
    'quote_ready',
    'payment_pending',
    'payment_failed',
    'paid',
    'shopify_sync_pending',
    'shopify_synced',
    'shipment_booking_pending',
    'completed',
    'refund_pending',
    'refunded',
    'reconciliation_required'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE checkout_shipment_status AS ENUM (
    'quoted',
    'booking_pending',
    'booked',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cashfree_checkout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashfree_order_id text NOT NULL UNIQUE,
  status cashfree_checkout_status NOT NULL DEFAULT 'quote_ready',
  quote_hash text NOT NULL,
  cart_id text NOT NULL,
  destination_country_code text NOT NULL,
  currency_code text NOT NULL,
  item_subtotal numeric(16, 4) NOT NULL,
  discount_amount numeric(16, 4) NOT NULL,
  shipping_amount numeric(16, 4) NOT NULL,
  tax_amount numeric(16, 4) NOT NULL,
  total_amount numeric(16, 4) NOT NULL,
  quote_expires_at timestamptz NOT NULL,
  checkout_snapshot jsonb NOT NULL,
  payment_session_id text,
  payment_reference text,
  paid_at timestamptz,
  shopify_order_id text,
  shopify_order_name text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashfree_checkout_status_expiry_idx
  ON cashfree_checkout_orders (status, quote_expires_at);
CREATE INDEX IF NOT EXISTS cashfree_checkout_cart_idx
  ON cashfree_checkout_orders (cart_id, created_at);

CREATE TABLE IF NOT EXISTS cashfree_checkout_shipment_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id uuid NOT NULL
    REFERENCES cashfree_checkout_orders (id) ON DELETE CASCADE,
  package_index integer NOT NULL,
  shiprocket_order_id text NOT NULL UNIQUE,
  shiprocket_shipment_id text,
  courier_id text NOT NULL,
  courier_name text NOT NULL,
  quoted_amount numeric(16, 4) NOT NULL,
  status checkout_shipment_status NOT NULL DEFAULT 'quoted',
  awb_code text,
  tracking_url text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashfree_checkout_shipment_package_idx
    UNIQUE (checkout_order_id, package_index)
);

CREATE INDEX IF NOT EXISTS cashfree_checkout_shipment_status_idx
  ON cashfree_checkout_shipment_packages (checkout_order_id, status);
