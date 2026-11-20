CREATE TABLE IF NOT EXISTS storefront_return_settings (
  id text PRIMARY KEY DEFAULT 'storefront' CHECK (id = 'storefront'),
  return_window_days integer NOT NULL DEFAULT 4 CHECK (return_window_days >= 0 AND return_window_days <= 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO storefront_return_settings (id, return_window_days)
VALUES ('storefront', 4)
ON CONFLICT (id) DO NOTHING;
