ALTER TABLE storefront_return_settings
  DROP CONSTRAINT IF EXISTS storefront_return_settings_return_window_days_check;

ALTER TABLE storefront_return_settings
  DROP CONSTRAINT IF EXISTS storefront_return_window_days_check;

ALTER TABLE storefront_return_settings
  ADD CONSTRAINT storefront_return_window_days_check CHECK (return_window_days >= 0);
