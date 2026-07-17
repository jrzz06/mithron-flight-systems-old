-- Extend homepage ordering and section visibility for new CMS sections.

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
values
  ('mini-carousel', 20, true, 'published'),
  ('shelf-drone-world', 30, true, 'published'),
  ('banner-inter-shelf-1', 40, true, 'published'),
  ('shelf-drone-care', 50, true, 'published'),
  ('banner-inter-shelf-2', 60, true, 'published'),
  ('shelf-global-products', 70, true, 'published'),
  ('banner-inter-shelf-3', 80, true, 'published'),
  ('banner-full-viewport-1', 90, true, 'published'),
  ('banner-full-viewport-2', 100, true, 'published'),
  ('mission-agri', 110, true, 'published'),
  ('mission-city', 120, true, 'published'),
  ('testimonials', 130, true, 'published'),
  ('about', 140, true, 'published'),
  ('footer', 150, true, 'published')
on conflict (section_key) do update set
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

insert into public.section_visibility (section_key, route_path, is_visible, status)
values
  ('mini-carousel', '/', true, 'published'),
  ('shelf-drone-world', '/', true, 'published'),
  ('banner-inter-shelf-1', '/', true, 'published'),
  ('shelf-drone-care', '/', true, 'published'),
  ('banner-inter-shelf-2', '/', true, 'published'),
  ('shelf-global-products', '/', true, 'published'),
  ('banner-inter-shelf-3', '/', true, 'published'),
  ('banner-full-viewport-1', '/', true, 'published'),
  ('banner-full-viewport-2', '/', true, 'published'),
  ('mission-agri', '/', true, 'published'),
  ('mission-city', '/', true, 'published'),
  ('testimonials', '/', true, 'published'),
  ('about', '/', true, 'published'),
  ('footer', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = excluded.is_visible,
  status = excluded.status;
