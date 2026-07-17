-- SEC-003: Enforce media_assets.visibility on public read policy
drop policy if exists "media_assets public published read" on public.media_assets;
create policy "media_assets public published read"
  on public.media_assets for select
  using (
    status = 'published'
    and coalesce(is_visible, true) = true
    and visibility = 'public'
  );

-- SEC-004: Remove SVG from public storage bucket MIME allowlists
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif'
]
where id in ('mithron-products', 'mithron-cms', 'mithron-editorial');
