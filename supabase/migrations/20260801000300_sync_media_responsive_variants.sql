-- Backfill responsive_variants from legacy variants JSON when the newer column is still empty.
update public.media_assets
set
  responsive_variants = variants,
  alt_text = coalesce(alt_text, alt),
  updated_at = now()
where responsive_variants = '{}'::jsonb
  and variants is not null
  and variants <> '{}'::jsonb;
