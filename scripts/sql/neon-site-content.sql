-- Destination: fresh external Neon database only. Never apply to the source database.
CREATE TYPE site_content_kind AS ENUM ('hero_slide', 'home_image', 'customer_voice', 'video_post');
CREATE TYPE site_content_placement AS ENUM ('fabric_tile', 'weave_tile', 'regional_handloom_tile');
CREATE TYPE site_content_image_fit AS ENUM ('cover', 'contain');
CREATE TYPE site_content_image_aspect_ratio AS ENUM ('16:9', '3:2', '4:3', '5:4', '1:1');
CREATE TABLE site_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind site_content_kind NOT NULL,
  placement site_content_placement,
  title text NOT NULL,
  eyebrow text,
  body text,
  image_url text,
  mobile_image_url text,
  image_fit site_content_image_fit NOT NULL DEFAULT 'cover',
  desktop_image_aspect_ratio site_content_image_aspect_ratio NOT NULL DEFAULT '4:3',
  mobile_image_aspect_ratio site_content_image_aspect_ratio NOT NULL DEFAULT '5:4',
  media_url text,
  alt_text text,
  focal_point_x integer,
  focal_point_y integer,
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
