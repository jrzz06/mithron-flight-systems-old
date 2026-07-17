-- Center hero banner subjects on mobile viewports.

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', 'center 45%'),
  updated_at = timezone('utc', now())
where id = 'ag10-arrival';

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', 'center 42%'),
  updated_at = timezone('utc', now())
where id = 'mapping-flight';

update public.hero_banners
set
  composition = coalesce(composition, '{}'::jsonb)
    || jsonb_build_object('mobileMediaPosition', 'center 42%'),
  updated_at = timezone('utc', now())
where id = 'drone-ecosystem';
