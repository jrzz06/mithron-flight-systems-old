-- Shipment persistence and fulfillment lifecycle.
-- Additive only: preserve existing orders, order_items, warehouse stock, inventory movements, and storefront behavior.

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shipment_number text not null unique,
  shipment_status text not null default 'pending',
  warehouse_id text not null,
  carrier_name text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  returned_at timestamptz,
  notes text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_status_chk check (
    shipment_status in (
      'pending',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'cancelled'
    )
  ),
  constraint shipments_warehouse_id_not_blank_chk check (btrim(warehouse_id) <> ''),
  constraint shipments_number_not_blank_chk check (btrim(shipment_number) <> '')
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id text not null references public.mithron_products(slug) on delete restrict,
  variant_id text,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (shipment_id, order_item_id)
);

create table if not exists public.shipment_timeline (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text not null,
  notes text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shipment_timeline_event_not_blank_chk check (btrim(event_type) <> ''),
  constraint shipment_timeline_next_status_chk check (
    next_status in (
      'pending',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'cancelled'
    )
  ),
  constraint shipment_timeline_previous_status_chk check (
    previous_status is null or previous_status in (
      'pending',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'cancelled'
    )
  )
);

create index if not exists shipments_status_idx
  on public.shipments (shipment_status, updated_at desc);

create index if not exists shipments_order_idx
  on public.shipments (order_id, created_at desc);

create index if not exists shipments_warehouse_idx
  on public.shipments (warehouse_id, shipment_status, updated_at desc);

create index if not exists shipments_tracking_idx
  on public.shipments (carrier_name, tracking_number)
  where tracking_number is not null;

create index if not exists shipment_items_shipment_idx
  on public.shipment_items (shipment_id, product_id);

create index if not exists shipment_items_order_item_idx
  on public.shipment_items (order_item_id);

create index if not exists shipment_timeline_shipment_idx
  on public.shipment_timeline (shipment_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_movements_related_shipment_fk'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_related_shipment_fk
      foreign key (related_shipment_id)
      references public.shipments(id)
      on delete set null;
  end if;
end $$;

alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.shipment_timeline enable row level security;

drop policy if exists "shipments warehouse read" on public.shipments;
create policy "shipments warehouse read" on public.shipments
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('operations.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "shipments warehouse write" on public.shipments;
create policy "shipments warehouse write" on public.shipments
for all to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
)
with check (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "shipment_items warehouse read" on public.shipment_items;
create policy "shipment_items warehouse read" on public.shipment_items
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('operations.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "shipment_items warehouse write" on public.shipment_items;
create policy "shipment_items warehouse write" on public.shipment_items
for insert to authenticated
with check (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "shipment_timeline warehouse read" on public.shipment_timeline;
create policy "shipment_timeline warehouse read" on public.shipment_timeline
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('operations.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "shipment_timeline warehouse insert" on public.shipment_timeline;
create policy "shipment_timeline warehouse insert" on public.shipment_timeline
for insert to authenticated
with check (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "shipments service role manage" on public.shipments;
create policy "shipments service role manage" on public.shipments
for all to service_role
using (true)
with check (true);

drop policy if exists "shipment_items service role manage" on public.shipment_items;
create policy "shipment_items service role manage" on public.shipment_items
for all to service_role
using (true)
with check (true);

drop policy if exists "shipment_timeline service role manage" on public.shipment_timeline;
create policy "shipment_timeline service role manage" on public.shipment_timeline
for all to service_role
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.shipments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.shipment_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.shipment_timeline;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
