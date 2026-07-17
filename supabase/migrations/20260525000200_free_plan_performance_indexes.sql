-- Free-plan performance indexes for paginated admin, inventory, media, and CMS workflows.
-- Additive only: this migration does not change existing data or RLS behavior.

create index if not exists mithron_products_status_sort_idx
  on public.mithron_products (workflow_status, is_visible, sort_order, updated_at desc);

create index if not exists mithron_products_category_status_idx
  on public.mithron_products (category, workflow_status, is_visible, sort_order);

create index if not exists inventory_status_updated_idx
  on public.inventory (stock_status, updated_at desc);

create index if not exists inventory_product_sku_idx
  on public.inventory (product_slug, sku);

create index if not exists warehouse_stock_product_sku_idx
  on public.warehouse_stock (product_slug, sku, warehouse_code);

create index if not exists warehouse_stock_updated_idx
  on public.warehouse_stock (updated_at desc);

create index if not exists media_assets_updated_idx
  on public.media_assets (updated_at desc);

create index if not exists media_assets_bucket_folder_idx
  on public.media_assets (bucket, folder, updated_at desc);

create index if not exists content_revisions_entity_revision_idx
  on public.content_revisions (entity_table, entity_id, revision desc);

create index if not exists content_revisions_created_idx
  on public.content_revisions (created_at desc);

create index if not exists orders_status_updated_idx
  on public.orders (status, fulfillment_status, updated_at desc);

create index if not exists orders_created_idx
  on public.orders (created_at desc);
