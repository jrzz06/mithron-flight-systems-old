-- Drop duplicate redundant indexes (exact duplicates of shorter-named counterparts)
DROP INDEX IF EXISTS public.content_revisions_entity_revision_idx;
DROP INDEX IF EXISTS public.shipment_items_order_item_id_idx;

-- Delete orphan media_assets rows with no matching storage object
DELETE FROM media_assets ma
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id = ma.bucket AND o.name = ma.storage_path
);
