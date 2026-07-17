-- Commerce system hardening: movement types, warehouses entity, checkout idempotency, indexes.

-- 1a. Fix adjustment_in / adjustment_out CHECK constraint
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_chk;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_chk check (
    movement_type in (
      'stock_in',
      'stock_out',
      'adjustment',
      'adjustment_in',
      'adjustment_out',
      'transfer',
      'fulfillment',
      'return',
      'damaged',
      'correction',
      'reservation',
      'reservation_release'
    )
  );

-- 1b. Warehouses entity table
create table if not exists public.warehouses (
  code text primary key,
  name text not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint warehouses_code_not_blank_chk check (btrim(code) <> '')
);

insert into public.warehouses (code, name, location)
values ('IN-WEST-01', 'West India — Primary', 'India')
on conflict (code) do nothing;

insert into public.warehouses (code, name)
select distinct btrim(warehouse_code), btrim(warehouse_code)
from public.warehouse_stock
where warehouse_code is not null
  and btrim(warehouse_code) <> ''
on conflict (code) do nothing;

insert into public.warehouses (code, name)
select distinct btrim(warehouse_id), btrim(warehouse_id)
from public.shipments
where warehouse_id is not null
  and btrim(warehouse_id) <> ''
on conflict (code) do nothing;

insert into public.warehouses (code, name)
select distinct btrim(warehouse_code), btrim(warehouse_code)
from public.inventory_movements
where warehouse_code is not null
  and btrim(warehouse_code) <> ''
on conflict (code) do nothing;

alter table public.warehouses enable row level security;

drop policy if exists warehouses_read_active on public.warehouses;
create policy warehouses_read_active on public.warehouses
for select to authenticated
using (
  is_active = true
  or public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('settings.write')
);

drop policy if exists warehouses_manage on public.warehouses;
create policy warehouses_manage on public.warehouses
for all to authenticated
using (public.has_cms_permission('settings.write'))
with check (public.has_cms_permission('settings.write'));

drop policy if exists warehouses_service_role on public.warehouses;
create policy warehouses_service_role on public.warehouses
for all to service_role
using (true)
with check (true);

alter table public.warehouse_stock
  drop constraint if exists warehouse_stock_code_fk;

alter table public.warehouse_stock
  add constraint warehouse_stock_code_fk
  foreign key (warehouse_code) references public.warehouses(code) on delete restrict not valid;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_code_fk;

alter table public.inventory_movements
  add constraint inventory_movements_code_fk
  foreign key (warehouse_code) references public.warehouses(code) on delete restrict not valid;

alter table public.shipments
  drop constraint if exists shipments_warehouse_code_fk;

alter table public.shipments
  add constraint shipments_warehouse_code_fk
  foreign key (warehouse_id) references public.warehouses(code) on delete restrict not valid;

alter table public.warehouse_stock validate constraint warehouse_stock_code_fk;
alter table public.inventory_movements validate constraint inventory_movements_code_fk;
alter table public.shipments validate constraint shipments_warehouse_code_fk;

-- 1c. Checkout idempotency unique index
create unique index if not exists orders_idempotency_key_uidx
  on public.orders ((metadata->>'idempotency_key'))
  where metadata->>'idempotency_key' is not null;

-- 1e. Index cleanup and additions
drop index if exists public.orders_created_by_user_id_idx;
drop index if exists public.orders_created_by_idx;

create index if not exists order_items_product_slug_idx
  on public.order_items (product_slug);

-- 1f. Deprecate legacy fulfill_order_and_deduct_stock RPC
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from public;
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from anon;
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from authenticated;

comment on function public.fulfill_order_and_deduct_stock(uuid, text, text) is
  'DEPRECATED: use fulfill_reserved_stock + shipment workflows. Scheduled for removal.';
