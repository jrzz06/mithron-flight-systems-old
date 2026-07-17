alter table public.mithron_products
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists og_title text,
  add column if not exists og_description text,
  add column if not exists og_image jsonb;
