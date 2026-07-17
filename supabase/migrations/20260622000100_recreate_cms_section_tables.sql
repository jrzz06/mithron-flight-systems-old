-- Recreate section_visibility and homepage_ordering without FK to dropped homepage_sections.
-- Migration 20260619000200 dropped homepage_sections CASCADE, which removed these tables.

create table if not exists public.section_visibility (
  id uuid primary key default gen_random_uuid(),
  section_key text not null,
  route_path text not null default '/',
  is_visible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.cms_publish_status not null default 'published',
  created_at timestamptz not null default now(),
  unique (section_key, route_path)
);

create table if not exists public.homepage_ordering (
  section_key text primary key,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  updated_at timestamptz not null default now()
);

insert into public.section_visibility (section_key, route_path, is_visible, status)
values
  ('hero', '/', true, 'published'),
  ('product-icon-rail', '/', true, 'published'),
  ('interests', '/', true, 'published'),
  ('trust', '/', true, 'published'),
  ('cinematic-media-rail', '/', true, 'published'),
  ('community', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = excluded.is_visible,
  status = excluded.status;

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
values
  ('hero', 10, true, 'published'),
  ('product-icon-rail', 20, true, 'published'),
  ('interests', 30, true, 'published'),
  ('trust', 40, true, 'published'),
  ('cinematic-media-rail', 50, true, 'published'),
  ('community', 60, true, 'published')
on conflict (section_key) do update set
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

alter table public.section_visibility enable row level security;
alter table public.homepage_ordering enable row level security;

drop policy if exists "section_visibility public published read" on public.section_visibility;
create policy "section_visibility public published read"
  on public.section_visibility
  for select
  using (status = 'published' and coalesce(is_visible, true) = true);

drop policy if exists "homepage_ordering public published read" on public.homepage_ordering;
create policy "homepage_ordering public published read"
  on public.homepage_ordering
  for select
  using (status = 'published' and coalesce(is_visible, true) = true);

drop policy if exists "section_visibility service role manage" on public.section_visibility;
create policy "section_visibility service role manage"
  on public.section_visibility
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "homepage_ordering service role manage" on public.homepage_ordering;
create policy "homepage_ordering service role manage"
  on public.homepage_ordering
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists section_visibility_route_cutover_idx
  on public.section_visibility (route_path, status, is_visible, section_key);

create index if not exists homepage_ordering_public_cutover_idx
  on public.homepage_ordering (status, is_visible, sort_order, section_key);
