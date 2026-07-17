-- Enable realtime publication for public storefront catalog/CMS tables
-- that the new enterprise "storefront" scope subscribes to.
-- Additive only: replica identity full + join supabase_realtime when missing.
-- RLS remains enforced for postgres_changes payloads (anon select already exists).

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'mithron_products',
    'category_metadata',
    'media_assets',
    'product_media_assets',
    'cms_pages',
    'cms_sections',
    'hero_banners',
    'homepage_ordering',
    'site_navigation',
    'footer_columns',
    'footer_links',
    'promotional_campaigns',
    'faqs',
    'blog_posts'
  ]
  loop
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
