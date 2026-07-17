-- Hero shelf CMS fix: default composition for responsive cropping.
-- Existing 16:9 hero assets should be re-uploaded at 1920×800; validation rejects other sizes on next edit.

update public.hero_banners
set composition = coalesce(composition, '{}'::jsonb)
  || jsonb_build_object(
    'mediaPosition', coalesce(composition->>'mediaPosition', 'right center'),
    'mobileMediaPosition', coalesce(composition->>'mobileMediaPosition', 'center center')
  )
where composition->>'mediaPosition' is null
   or composition->>'mobileMediaPosition' is null;
