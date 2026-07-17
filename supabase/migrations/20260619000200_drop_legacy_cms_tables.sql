-- Drop legacy CMS tables superseded by admin_settings + product_reviews.
-- CSV backups captured in docs/supabase-audit/backups/ during preflight.

drop table if exists public.testimonials cascade;
drop table if exists public.homepage_sections cascade;
