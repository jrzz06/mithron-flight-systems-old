-- Ensure Customer Testimonials is visible in homepage ordering and section visibility.
-- Matches homepage-section-registry.ts sortOrder 130.

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
values
  ('testimonials', 130, true, 'published')
on conflict (section_key) do update set
  sort_order = excluded.sort_order,
  is_visible = true,
  status = excluded.status,
  updated_at = now();

insert into public.section_visibility (section_key, route_path, is_visible, status)
values
  ('testimonials', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = true,
  status = excluded.status;
