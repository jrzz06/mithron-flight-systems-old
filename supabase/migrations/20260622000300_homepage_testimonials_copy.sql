-- Refresh homepage testimonials header copy in admin_settings (fixes legacy jerus typo and old defaults).
update public.admin_settings
set payload = jsonb_set(
  coalesce(payload, '{}'::jsonb),
  '{testimonials}',
  coalesce(payload->'testimonials', '{}'::jsonb) || jsonb_build_object(
    'eyebrow', 'Customer testimonials',
    'title', 'Customer testimonials',
    'lead', '',
    'linkLabel', '',
    'linkHref', ''
  ),
  true
),
updated_at = timezone('utc', now())
where id = 'global'
  and (
    coalesce(payload->'testimonials'->>'title', '') ilike '%jerus%'
    or coalesce(payload->'testimonials'->>'title', '') = 'What customers say about our drones'
    or coalesce(payload->'testimonials'->>'eyebrow', '') in ('Product reviews', 'Customer voices')
    or coalesce(payload->'testimonials'->>'title', '') = 'Trusted by pilots and field teams'
    or coalesce(payload->'testimonials'->>'lead', '') in (
      '',
      'Real feedback from operators running agriculture, mapping, and surveillance missions with Mithron hardware.'
    )
  );
