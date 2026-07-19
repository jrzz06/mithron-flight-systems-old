-- Seed related-articles into homepage ordering and section visibility.
-- Matches homepage-section-registry.ts sortOrder 140.

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
values
  ('related-articles', 140, true, 'published')
on conflict (section_key) do update set
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

insert into public.section_visibility (section_key, route_path, is_visible, status)
values
  ('related-articles', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = excluded.is_visible,
  status = excluded.status;
