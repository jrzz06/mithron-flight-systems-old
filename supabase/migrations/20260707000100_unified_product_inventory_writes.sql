-- Unified product + inventory writes: one RPC updates inventory, warehouse_stock, and product availability atomically.
-- Removes duplicate propagation triggers; DB constraints + product insert trigger remain the safety net.

drop trigger if exists trg_sync_inventory_on_update on public.inventory;
drop trigger if exists trg_sync_inventory_on_insert on public.inventory;

create or replace function public.upsert_product_inventory(
  p_product_slug text,
  p_sku text,
  p_warehouse_code text,
  p_quantity integer,
  p_reserved_quantity integer default 0,
  p_reorder_threshold integer default 0,
  p_stock_status text default null,
  p_variant_id text default null,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text;
  v_existing_ws public.warehouse_stock%rowtype;
  v_stock_status text;
  v_sellable integer;
  v_committed integer;
  v_availability text;
begin
  if coalesce(trim(p_product_slug), '') = '' then
    raise exception 'product_slug is required';
  end if;
  if coalesce(trim(p_warehouse_code), '') = '' then
    raise exception 'warehouse_code is required';
  end if;
  if p_quantity < 0 or p_reserved_quantity < 0 or p_reorder_threshold < 0 then
    raise exception 'Quantities cannot be negative';
  end if;
  if p_reserved_quantity > p_quantity then
    raise exception 'Reserved quantity cannot exceed inventory quantity';
  end if;

  if not exists (select 1 from public.mithron_products p where p.slug = p_product_slug) then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_sku := coalesce(nullif(trim(p_sku), ''), public.derive_product_sku(p_product_slug));
  v_sellable := greatest(0, p_quantity - p_reserved_quantity);

  select * into v_existing_ws
  from public.warehouse_stock ws
  where ws.warehouse_code = p_warehouse_code
    and ws.product_slug = p_product_slug
    and ws.sku = v_sku
  for update;

  v_committed := least(
    greatest(0, coalesce(v_existing_ws.committed_quantity, p_reserved_quantity, 0)),
    v_sellable
  );

  if p_stock_status in ('available', 'low_stock', 'out_of_stock') then
    v_stock_status := p_stock_status;
  elsif v_sellable <= 0 then
    v_stock_status := 'out_of_stock';
  elsif p_reorder_threshold > 0 and v_sellable <= p_reorder_threshold then
    v_stock_status := 'low_stock';
  else
    v_stock_status := 'available';
  end if;

  v_availability := case v_stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end;

  insert into public.inventory (
    product_slug,
    sku,
    variant_id,
    stock_status,
    quantity,
    reserved_quantity,
    reorder_threshold,
    updated_by,
    updated_at
  )
  values (
    p_product_slug,
    v_sku,
    p_variant_id,
    v_stock_status,
    p_quantity,
    p_reserved_quantity,
    p_reorder_threshold,
    p_updated_by,
    now()
  )
  on conflict (product_slug, sku) do update set
    variant_id = coalesce(excluded.variant_id, inventory.variant_id),
    stock_status = excluded.stock_status,
    quantity = excluded.quantity,
    reserved_quantity = excluded.reserved_quantity,
    reorder_threshold = excluded.reorder_threshold,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.warehouse_stock (
    warehouse_code,
    product_slug,
    sku,
    variant_id,
    available_quantity,
    committed_quantity,
    updated_by,
    updated_at,
    last_counted_at
  )
  values (
    p_warehouse_code,
    p_product_slug,
    v_sku,
    p_variant_id,
    v_sellable,
    v_committed,
    p_updated_by,
    now(),
    now()
  )
  on conflict (warehouse_code, product_slug, sku) do update set
    variant_id = coalesce(excluded.variant_id, warehouse_stock.variant_id),
    available_quantity = excluded.available_quantity,
    committed_quantity = greatest(warehouse_stock.committed_quantity, excluded.committed_quantity),
    updated_by = excluded.updated_by,
    updated_at = now(),
    last_counted_at = now();

  update public.mithron_products
  set
    source_availability = v_availability,
    updated_at = now()
  where slug = p_product_slug;

  return jsonb_build_object(
    'ok', true,
    'product_slug', p_product_slug,
    'sku', v_sku,
    'stock_status', v_stock_status,
    'quantity', p_quantity,
    'available_quantity', v_sellable,
    'committed_quantity', v_committed,
    'warehouse_code', p_warehouse_code
  );
end;
$$;

revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from public;
revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from anon;
revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from authenticated;
grant execute on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) to service_role;

comment on function public.upsert_product_inventory is
  'Single write path for catalog inventory, warehouse stock, and product availability.';
