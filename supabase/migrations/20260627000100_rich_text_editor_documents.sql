-- Rich text editor: JSON source of truth, HTML render cache, media reference tracking.

ALTER TABLE public.mithron_products
  ADD COLUMN IF NOT EXISTS description_json jsonb;

COMMENT ON COLUMN public.mithron_products.description_json IS 'TipTap JSON document — canonical product description.';
COMMENT ON COLUMN public.mithron_products.description IS 'Sanitized HTML generated from description_json for storefront rendering.';

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS notes_json jsonb;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS notes_json jsonb;

CREATE TABLE IF NOT EXISTS public.editor_document_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  document_id text NOT NULL,
  media_asset_id text NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  referenced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS editor_document_media_asset_idx
  ON public.editor_document_media (media_asset_id);

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;

-- media_assets.status is cms_publish_status enum; extend it for orphan workflow instead of a text check.
ALTER TYPE public.cms_publish_status ADD VALUE IF NOT EXISTS 'orphaned';
ALTER TYPE public.cms_publish_status ADD VALUE IF NOT EXISTS 'active';

COMMENT ON TABLE public.editor_document_media IS 'Tracks media assets referenced by TipTap editor documents for orphan cleanup.';
COMMENT ON COLUMN public.media_assets.orphaned_at IS 'When set, asset is queued for deletion after grace period if unreferenced.';
