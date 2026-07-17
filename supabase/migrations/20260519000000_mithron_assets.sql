create table if not exists public.mithron_assets (
  asset_id text primary key,
  product_slug text,
  category text not null,
  bucket text not null check (
    bucket in (
      'mithron-hero',
      'mithron-products',
      'mithron-interests',
      'mithron-story',
      'mithron-thumbnails'
    )
  ),
  storage_path text not null,
  asset_role text not null check (
    asset_role in ('hero', 'product', 'story', 'thumbnail', 'poster')
  ),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  variant_width integer not null check (variant_width > 0),
  format text not null check (format in ('avif', 'webp', 'png')),
  mime_type text not null check (mime_type in ('image/avif', 'image/webp', 'image/png')),
  blurhash text,
  blur_data_url text,
  dominant_color text not null,
  generated_prompt_id text not null,
  source_catalog_id text,
  content_hash text not null,
  optimized_size_kb numeric(10, 2) not null check (optimized_size_kb >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index if not exists mithron_assets_product_slug_idx
  on public.mithron_assets (product_slug);

create index if not exists mithron_assets_category_idx
  on public.mithron_assets (category);

create index if not exists mithron_assets_bucket_idx
  on public.mithron_assets (bucket);

create index if not exists mithron_assets_asset_role_idx
  on public.mithron_assets (asset_role);

create index if not exists mithron_assets_lookup_idx
  on public.mithron_assets (product_slug, asset_role, variant_width, format);

alter table public.mithron_assets enable row level security;

drop policy if exists "mithron assets are publicly readable" on public.mithron_assets;
create policy "mithron assets are publicly readable"
  on public.mithron_assets
  for select
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mithron-hero', 'mithron-hero', true, 5242880, array['image/avif', 'image/webp', 'image/png']),
  ('mithron-products', 'mithron-products', true, 2097152, array['image/avif', 'image/webp', 'image/png']),
  ('mithron-interests', 'mithron-interests', true, 3145728, array['image/avif', 'image/webp', 'image/png']),
  ('mithron-story', 'mithron-story', true, 3145728, array['image/avif', 'image/webp', 'image/png']),
  ('mithron-thumbnails', 'mithron-thumbnails', true, 524288, array['image/avif', 'image/webp', 'image/png'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mithron visual assets are publicly readable" on storage.objects;
create policy "mithron visual assets are publicly readable"
  on storage.objects
  for select
  using (
    bucket_id in (
      'mithron-hero',
      'mithron-products',
      'mithron-interests',
      'mithron-story',
      'mithron-thumbnails'
    )
  );

drop policy if exists "service role writes mithron visual assets" on storage.objects;
create policy "service role writes mithron visual assets"
  on storage.objects
  for all
  to service_role
  using (
    bucket_id in (
      'mithron-hero',
      'mithron-products',
      'mithron-interests',
      'mithron-story',
      'mithron-thumbnails'
    )
  )
  with check (
    bucket_id in (
      'mithron-hero',
      'mithron-products',
      'mithron-interests',
      'mithron-story',
      'mithron-thumbnails'
    )
  );
