-- Reframe hero banner subjects for mobile portrait viewports.

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', '78% 47%'),
  updated_at = timezone('utc', now())
where id = 'ag10-arrival';

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', '66% 48%'),
  updated_at = timezone('utc', now())
where id = 'mapping-flight';

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', '82% 42%'),
  updated_at = timezone('utc', now())
where id = 'drone-ecosystem';
