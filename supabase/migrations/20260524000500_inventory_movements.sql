-- Warehouse inventory movement ledger.
-- Additive only: preserve existing inventory, warehouse stock, orders, and storefront behavior.

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.mithron_products(slug) on delete restrict,
  sku text not null,
  variant_id text,
  warehouse_code text not null,
  warehouse_stock_id uuid references public.warehouse_stock(id) on delete set null,
  movement_type text not null,
  quantity_delta integer not null,
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason_code text not null,
  notes text,
  actor_user_id uuid references auth.users(id) on delete set null,
  related_order_id uuid references public.orders(id) on delete set null,
  related_shipment_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_movements_movement_type_chk check (
    movement_type in (
      'stock_in',
      'stock_out',
      'adjustment',
      'transfer',
      'fulfillment',
      'return',
      'damaged',
      'correction'
    )
  ),
  constraint inventory_movements_sku_not_blank_chk check (btrim(sku) <> ''),
  constraint inventory_movements_warehouse_code_not_blank_chk check (btrim(warehouse_code) <> ''),
  constraint inventory_movements_reason_code_not_blank_chk check (btrim(reason_code) <> ''),
  constraint inventory_movements_variant_not_blank_chk check (variant_id is null or btrim(variant_id) <> ''),
  constraint inventory_movements_quantity_math_chk check (quantity_after = quantity_before + quantity_delta)
);

create index if not exists inventory_movements_product_variant_idx
  on public.inventory_movements (product_id, variant_id, sku, created_at desc);

create index if not exists inventory_movements_stock_idx
  on public.inventory_movements (warehouse_stock_id, created_at desc);

create index if not exists inventory_movements_warehouse_idx
  on public.inventory_movements (warehouse_code, movement_type, created_at desc);

create index if not exists inventory_movements_order_idx
  on public.inventory_movements (related_order_id, created_at desc)
  where related_order_id is not null;

create index if not exists inventory_movements_actor_idx
  on public.inventory_movements (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists inventory_movements_created_idx
  on public.inventory_movements (created_at desc);

alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_movements warehouse read" on public.inventory_movements;
create policy "inventory_movements warehouse read" on public.inventory_movements
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "inventory_movements warehouse insert" on public.inventory_movements;
create policy "inventory_movements warehouse insert" on public.inventory_movements
for insert to authenticated
with check (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "inventory_movements service role manage" on public.inventory_movements;
create policy "inventory_movements service role manage" on public.inventory_movements
for all to service_role
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.inventory_movements;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
