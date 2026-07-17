alter table public.mithron_products
  add column if not exists source_url text,
  add column if not exists source_catalog_id text,
  add column if not exists source_fingerprint text,
  add column if not exists source_description text,
  add column if not exists source_images jsonb not null default '[]'::jsonb,
  add column if not exists source_availability text,
  add column if not exists source_currency text,
  add column if not exists source_extracted_at timestamptz;

create unique index if not exists mithron_products_source_url_key
  on public.mithron_products (source_url)
  where source_url is not null;

create unique index if not exists mithron_products_source_catalog_id_key
  on public.mithron_products (source_catalog_id)
  where source_catalog_id is not null;

create unique index if not exists mithron_products_source_fingerprint_key
  on public.mithron_products (source_fingerprint)
  where source_fingerprint is not null;
