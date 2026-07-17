-- Product page & inventory sync: normalize availability labels, single-warehouse stock,
-- backfill warehouse quantities from catalog inventory, and keep layers aligned via trigger.

create or replace function public.resolve_default_warehouse_code()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select wc.checkout_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    (
      select w.code
      from public.warehouses w
      where w.is_active = true
      order by w.code asc
      limit 1
    ),
    'IN-WEST-01'
  );
$$;

-- 1. Normalize legacy Wix / import availability strings on products.
update public.mithron_products
set
  source_availability = case
    when lower(btrim(source_availability)) in ('instock', 'in stock', 'available') then 'In stock'
    when lower(btrim(source_availability)) in ('outofstock', 'out of stock', 'out_of_stock') then 'Out of stock'
    when lower(btrim(source_availability)) in ('lowstock', 'low stock', 'low_stock') then 'Low stock'
    when lower(btrim(source_availability)) in ('unknown', '') then 'In stock'
    when source_availability in ('In stock', 'Out of stock', 'Low stock') then source_availability
    else 'In stock'
  end,
  updated_at = now()
where source_availability is not null;

-- 2. Consolidate to the single canonical warehouse (IN-WEST-01 / configured default).
do $$
declare
  v_canonical text := public.resolve_default_warehouse_code();
begin
  update public.warehouse_configuration
  set
    default_warehouse_code = v_canonical,
    checkout_warehouse_code = v_canonical,
    supplier_intake_warehouse_code = coalesce(supplier_intake_warehouse_code, v_canonical),
    updated_at = now()
  where id = 'global';

  insert into public.warehouse_stock (
    warehouse_code,
    product_slug,
    sku,
    available_quantity,
    committed_quantity,
    updated_at
  )
  select
    v_canonical,
    i.product_slug,
    i.sku,
    i.quantity,
    coalesce(ws.committed_quantity, 0),
    now()
  from public.inventory i
  left join public.warehouse_stock ws
    on ws.product_slug = i.product_slug
   and ws.sku = i.sku
   and ws.warehouse_code = v_canonical
  on conflict (warehouse_code, product_slug, sku)
  do update set
    available_quantity = excluded.available_quantity,
    updated_at = now();

  delete from public.warehouse_stock
  where warehouse_code <> v_canonical;

  update public.warehouses
  set is_active = false
  where code <> v_canonical
    and is_active = true;
end;
$$;

-- 3. Backfill checkout warehouse stock from catalog inventory truth.
update public.warehouse_stock ws
set
  available_quantity = i.quantity,
  updated_at = now()
from public.inventory i
where ws.product_slug = i.product_slug
  and ws.sku = i.sku
  and ws.warehouse_code = public.resolve_default_warehouse_code()
  and ws.available_quantity is distinct from i.quantity;

-- 4. Align storefront availability labels with inventory stock_status.
update public.mithron_products p
set
  source_availability = case i.stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end,
  updated_at = now()
from public.inventory i
where i.product_slug = p.slug;

-- 5. Keep product page, catalog inventory, and checkout warehouse stock in sync.
create or replace function public.sync_inventory_to_product_and_warehouse()
returns trigger
language plpgsql
as $$
declare
  v_label text;
  v_warehouse text;
begin
  v_label := case new.stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end;

  v_warehouse := coalesce(
    (
      select wc.checkout_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    public.resolve_default_warehouse_code()
  );

  update public.mithron_products
  set
    source_availability = v_label,
    updated_at = now()
  where slug = new.product_slug;

  insert into public.warehouse_stock (
    warehouse_code,
    product_slug,
    sku,
    available_quantity,
    committed_quantity,
    updated_at
  )
  values (
    v_warehouse,
    new.product_slug,
    new.sku,
    new.quantity,
    0,
    now()
  )
  on conflict (warehouse_code, product_slug, sku)
  do update set
    available_quantity = excluded.available_quantity,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_inventory_on_update on public.inventory;
create trigger trg_sync_inventory_on_update
after update of quantity, stock_status on public.inventory
for each row
execute function public.sync_inventory_to_product_and_warehouse();

drop trigger if exists trg_sync_inventory_on_insert on public.inventory;
create trigger trg_sync_inventory_on_insert
after insert on public.inventory
for each row
execute function public.sync_inventory_to_product_and_warehouse();

comment on function public.sync_inventory_to_product_and_warehouse() is
  'Propagates inventory quantity/status to mithron_products.source_availability and checkout warehouse_stock.';
