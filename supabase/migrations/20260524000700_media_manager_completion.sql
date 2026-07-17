alter table public.media_assets
  add column if not exists alt_text text,
  add column if not exists caption text,
  add column if not exists file_size_bytes bigint,
  add column if not exists responsive_variants jsonb not null default '{}'::jsonb,
  add column if not exists upload_metadata jsonb not null default '{}'::jsonb,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'public';

update public.media_assets
set
  alt_text = coalesce(alt_text, alt),
  file_size_bytes = coalesce(file_size_bytes, size_bytes),
  uploaded_by = coalesce(uploaded_by, created_by),
  responsive_variants = case
    when responsive_variants = '{}'::jsonb and variants <> '{}'::jsonb then variants
    else responsive_variants
  end,
  upload_metadata = upload_metadata || jsonb_build_object(
    'legacy_alt_synced', alt is not null,
    'legacy_size_synced', size_bytes is not null
  )
where alt_text is null
   or file_size_bytes is null
   or uploaded_by is null
   or responsive_variants = '{}'::jsonb;

alter table public.product_media_assets
  add column if not exists variant_id text,
  add column if not exists alt_text text,
  add column if not exists caption text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.media_assets
    add constraint media_assets_visibility_check
    check (visibility in ('public', 'private', 'internal', 'draft', 'archived'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.media_assets
    add constraint media_assets_file_size_check
    check ((file_size_bytes is null or file_size_bytes >= 0) and (size_bytes is null or size_bytes >= 0));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.media_assets
    add constraint media_assets_dimensions_check
    check ((width is null or width > 0) and (height is null or height > 0));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_media_assets
    add constraint product_media_assets_usage_check
    check (usage in ('primary', 'gallery', 'variant', 'seo', 'social', 'cms', 'campaign', 'testimonial'));
exception
  when duplicate_object then null;
end $$;

create index if not exists media_assets_tags_idx on public.media_assets using gin (tags);
create index if not exists media_assets_folder_visibility_idx on public.media_assets (folder, visibility, status, updated_at desc);
create index if not exists media_assets_uploaded_by_idx on public.media_assets (uploaded_by, updated_at desc);
create index if not exists media_assets_mime_idx on public.media_assets (mime_type, updated_at desc);
create index if not exists product_media_assets_variant_idx on public.product_media_assets (product_slug, variant_id, usage, sort_order);
create index if not exists product_media_assets_primary_idx on public.product_media_assets (product_slug, is_primary, sort_order);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mithron-products', 'mithron-products', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']),
  ('mithron-cms', 'mithron-cms', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']),
  ('mithron-editorial', 'mithron-editorial', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']),
  ('mithron-warehouse-documents', 'mithron-warehouse-documents', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_assets admin write" on public.media_assets;
create policy "media_assets admin write" on public.media_assets for all to authenticated
using (public.has_cms_permission('media.write') or public.has_cms_permission('cms.write'))
with check (public.has_cms_permission('media.write') or public.has_cms_permission('cms.write'));

drop policy if exists "media_assets service role manage" on public.media_assets;
create policy "media_assets service role manage" on public.media_assets for all to service_role using (true) with check (true);

drop policy if exists "product_media_assets admin read" on public.product_media_assets;
create policy "product_media_assets admin read" on public.product_media_assets for select to authenticated
using (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'));

drop policy if exists "product_media_assets admin write" on public.product_media_assets;
create policy "product_media_assets admin write" on public.product_media_assets for all to authenticated
using (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'))
with check (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'));

drop policy if exists "product_media_assets service role manage" on public.product_media_assets;
create policy "product_media_assets service role manage" on public.product_media_assets for all to service_role using (true) with check (true);

drop policy if exists "mithron canonical media public read" on storage.objects;
create policy "mithron canonical media public read" on storage.objects for select
using (
  bucket_id in (
    'mithron-products',
    'mithron-cms',
    'mithron-editorial',
    'mithron-hero',
    'mithron-interests',
    'mithron-story',
    'mithron-thumbnails'
  )
);

drop policy if exists "mithron canonical media authenticated upload" on storage.objects;
create policy "mithron canonical media authenticated upload" on storage.objects for insert to authenticated
with check (
  bucket_id in ('mithron-products', 'mithron-cms', 'mithron-editorial', 'mithron-warehouse-documents')
  and public.has_cms_permission('media.write')
);

drop policy if exists "mithron canonical media authenticated update" on storage.objects;
create policy "mithron canonical media authenticated update" on storage.objects for update to authenticated
using (
  bucket_id in ('mithron-products', 'mithron-cms', 'mithron-editorial', 'mithron-warehouse-documents')
  and public.has_cms_permission('media.write')
)
with check (
  bucket_id in ('mithron-products', 'mithron-cms', 'mithron-editorial', 'mithron-warehouse-documents')
  and public.has_cms_permission('media.write')
);

drop policy if exists "mithron canonical media service role manage" on storage.objects;
create policy "mithron canonical media service role manage" on storage.objects for all to service_role
using (bucket_id in ('mithron-products', 'mithron-cms', 'mithron-editorial', 'mithron-warehouse-documents'))
with check (bucket_id in ('mithron-products', 'mithron-cms', 'mithron-editorial', 'mithron-warehouse-documents'));

do $$
begin
  alter publication supabase_realtime add table public.media_assets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_media_assets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
