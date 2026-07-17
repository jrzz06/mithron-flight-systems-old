-- Remove media_assets records for source-* files that have a confirmed non-source pair.
-- Storage object removal uses the Supabase Storage API (direct storage.objects DELETE is blocked).
DELETE FROM media_assets ma
WHERE ma.bucket = 'mithron-products'
  AND ma.storage_path LIKE 'catalog-cutouts/v1/source-%'
  AND EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'mithron-products'
      AND o.name = 'catalog-cutouts/v1/' || substring(ma.storage_path FROM length('catalog-cutouts/v1/source-') + 1)
  );
