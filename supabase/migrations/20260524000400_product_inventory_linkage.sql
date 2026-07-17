-- Product inventory linkage completion.
-- Additive only: preserve existing product rows, warehouse rows, and fallback paths.

alter table public.inventory
  add column if not exists variant_id text;

alter table public.warehouse_stock
  add column if not exists variant_id text;

alter table public.inventory
  drop constraint if exists inventory_sku_required_chk;

alter table public.inventory
  add constraint inventory_sku_required_chk
  check (sku is not null and btrim(sku) <> '') not valid;

alter table public.warehouse_stock
  drop constraint if exists warehouse_stock_sku_required_chk;

alter table public.warehouse_stock
  add constraint warehouse_stock_sku_required_chk
  check (sku is not null and btrim(sku) <> '') not valid;

alter table public.inventory
  drop constraint if exists inventory_variant_id_not_blank_chk;

alter table public.inventory
  add constraint inventory_variant_id_not_blank_chk
  check (variant_id is null or btrim(variant_id) <> '') not valid;

alter table public.warehouse_stock
  drop constraint if exists warehouse_stock_variant_id_not_blank_chk;

alter table public.warehouse_stock
  add constraint warehouse_stock_variant_id_not_blank_chk
  check (variant_id is null or btrim(variant_id) <> '') not valid;

create index if not exists inventory_variant_lookup_idx
  on public.inventory (product_slug, variant_id, sku);

create index if not exists warehouse_stock_variant_lookup_idx
  on public.warehouse_stock (warehouse_code, product_slug, variant_id, sku);

create index if not exists inventory_low_stock_idx
  on public.inventory (stock_status, updated_at desc)
  where stock_status in ('low_stock', 'out_of_stock');
