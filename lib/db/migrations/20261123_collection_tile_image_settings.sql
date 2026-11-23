CREATE TYPE site_content_image_fit AS ENUM ('cover', 'contain');
CREATE TYPE site_content_image_aspect_ratio AS ENUM ('16:9', '3:2', '4:3', '5:4', '1:1');

ALTER TABLE site_content_items
  ADD COLUMN mobile_image_url text,
  ADD COLUMN image_fit site_content_image_fit NOT NULL DEFAULT 'cover',
  ADD COLUMN desktop_image_aspect_ratio site_content_image_aspect_ratio NOT NULL DEFAULT '4:3',
  ADD COLUMN mobile_image_aspect_ratio site_content_image_aspect_ratio NOT NULL DEFAULT '5:4';
