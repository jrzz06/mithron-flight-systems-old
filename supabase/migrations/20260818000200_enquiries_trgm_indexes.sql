-- M9: Trigram GIN indexes for enquiries ilike search (customer_email, subject).
-- Additive only. Prefer non-CONCURRENTLY for Supabase migration runner (transactions).
--
-- Rollback:
--   DROP INDEX IF EXISTS public.enquiries_customer_email_trgm_idx;
--   DROP INDEX IF EXISTS public.enquiries_subject_trgm_idx;
--   -- Extension left in place (may be used elsewhere):
--   -- DROP EXTENSION IF EXISTS pg_trgm;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS enquiries_customer_email_trgm_idx
  ON public.enquiries USING gin (customer_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS enquiries_subject_trgm_idx
  ON public.enquiries USING gin (subject gin_trgm_ops);
