-- Publish remaining admin control-plane tables to supabase_realtime.
-- Additive and idempotent: only joins missing tables, keeps RLS enforced.
-- REPLICA IDENTITY FULL enables DELETE/UPDATE payloads with old row fields.

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'admin_invites',
    'roles',
    'customer_order_reviews',
    'product_review_helpful_votes',
    'press_coverage',
    'data_archive_runs',
    'audit_logs',
    'cms_pages',
    'cms_sections',
    'hero_banners',
    'homepage_ordering',
    'section_visibility',
    'site_navigation',
    'footer_columns',
    'footer_links',
    'promotional_campaigns',
    'faqs',
    'blog_posts',
    'media_assets',
    'product_media_assets',
    'category_metadata',
    'security_events'
  ] loop
    if to_regclass(format('public.%I', realtime_table)) is not null then
      execute format('alter table public.%I replica identity full', realtime_table);
      begin
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      exception
        when duplicate_object then null;
        when undefined_object then null;
      end;
    end if;
  end loop;
end $$;
