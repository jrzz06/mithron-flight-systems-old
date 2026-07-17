-- Repaired migration.
--
-- This file was previously committed corrupt (its entire contents were the
-- single character "u"), which caused any `supabase db push` / migration apply
-- against a fresh environment to fail. The tiered short-query search behaviour
-- this file was meant to introduce is now fully defined by the later migration
-- `20260711000100_clear_auto_assigned_product_badges.sql`, which redefines
-- `public.search_published_products(text, integer)` with the FTS + ILIKE
-- fallback used in production.
--
-- To keep the migration history linear and replayable without re-introducing or
-- conflicting with that later definition, this migration is intentionally a
-- safe no-op. It simply asks PostgREST to reload its schema cache, which is
-- idempotent and harmless.

notify pgrst, 'reload schema';
