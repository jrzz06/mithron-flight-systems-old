-- Additive optimistic concurrency for homepage CMS JSON (admin_settings).
-- Reversible: ALTER TABLE public.admin_settings DROP COLUMN IF EXISTS payload_version;

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS payload_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.admin_settings.payload_version IS
  'Optimistic concurrency token for homepage CMS JSON upserts. Incremented on each successful write.';
