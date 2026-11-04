-- Destination: fresh external Neon database only. Never apply to the source database.
CREATE TYPE site_content_kind AS ENUM ('hero_slide', 'home_image', 'customer_voice', 'video_post');
CREATE TYPE site_content_placement AS ENUM ('fabric_tile', 'weave_tile');
CREATE TABLE site_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind site_content_kind NOT NULL,
  placement site_content_placement,
  title text NOT NULL,
  eyebrow text,
  body text,
  image_url text,
  media_url text,
  alt_text text,
  cta_label text,
  cta_url text,
  linked_product_id text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_content_kind_order_idx ON site_content_items(kind, sort_order);
CREATE INDEX site_content_publication_idx ON site_content_items(published, approved);
