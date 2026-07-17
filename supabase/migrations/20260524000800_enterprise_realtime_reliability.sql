-- Enterprise realtime reliability and stabilization.
-- Additive only: expands protected operational publications and old-row availability.
-- Storefront realtime remains disabled at the application layer.

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'notifications',
    'activity_logs',
    'inventory',
    'warehouse_stock',
    'inventory_movements',
    'orders',
    'order_items',
    'shipments',
    'shipment_items',
    'shipment_timeline',
    'deployment_requests',
    'staff_tasks',
    'cms_pages',
    'cms_sections',
    'hero_banners',
    'homepage_sections',
    'content_revisions',
    'media_assets',
    'product_media_assets'
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
