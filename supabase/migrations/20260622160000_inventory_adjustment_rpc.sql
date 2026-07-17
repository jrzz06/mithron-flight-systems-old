-- Atomic inventory adjustment with row locking for parallel warehouse edits.

create or replace function public.apply_inventory_adjustment(
  p_product_slug text,
  p_sku text,
  p_warehouse_code text,
  p_quantity_delta integer,
  p_reason_code text default 'manual_adjustment',
  p_notes text default null,
  p_actor_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.warehouse_stock%rowtype;
  v_inventory public.inventory%rowtype;
  v_qty_before integer;
  v_qty_after integer;
  v_movement_id uuid;
begin
  if p_product_slug is null or p_sku is null or p_warehouse_code is null then
    raise exception 'product_slug, sku, and warehouse_code are required';
  end if;

  if p_quantity_delta = 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  select * into v_stock
  from public.warehouse_stock
  where product_slug = p_product_slug
    and sku is not distinct from p_sku
    and warehouse_code = p_warehouse_code
  for update;

  if not found then
    raise exception 'warehouse_stock not found for %/% in %', p_product_slug, p_sku, p_warehouse_code;
  end if;

  if p_expected_updated_at is not null
     and v_stock.updated_at is not null
     and v_stock.updated_at <> p_expected_updated_at then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'current_row', to_jsonb(v_stock),
      'current_updated_at', v_stock.updated_at
    );
  end if;

  v_qty_before := coalesce(v_stock.available_quantity, 0);
  v_qty_after := v_qty_before + p_quantity_delta;

  if v_qty_after < 0 then
    raise exception 'Insufficient stock for %/%: available %, delta %',
      p_product_slug, p_sku, v_qty_before, p_quantity_delta;
  end if;

  update public.warehouse_stock
  set available_quantity = v_qty_after,
      updated_at = now()
  where id = v_stock.id;

  select * into v_inventory
  from public.inventory
  where product_slug = p_product_slug
    and sku is not distinct from p_sku
  for update;

  if found then
    update public.inventory
    set quantity = greatest(0, coalesce(quantity, 0) + p_quantity_delta),
        updated_at = now()
    where product_slug = p_product_slug
      and sku is not distinct from p_sku;
  end if;

  insert into public.inventory_movements (
    product_id,
    sku,
    warehouse_code,
    warehouse_stock_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason_code,
    notes,
    actor_user_id
  ) values (
    p_product_slug,
    p_sku,
    p_warehouse_code,
    v_stock.id,
    case when p_quantity_delta < 0 then 'adjustment_out' else 'adjustment_in' end,
    p_quantity_delta,
    v_qty_before,
    v_qty_after,
    coalesce(p_reason_code, 'manual_adjustment'),
    p_notes,
    p_actor_id
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'movement_id', v_movement_id,
    'quantity_before', v_qty_before,
    'quantity_after', v_qty_after
  );
end;
$$;

create or replace function public.order_has_checkout_reservations(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.inventory_movements
    where related_order_id = p_order_id
      and movement_type = 'reservation'
  );
$$;

revoke all on function public.apply_inventory_adjustment(text, text, text, integer, text, text, uuid, timestamptz) from public;
revoke all on function public.apply_inventory_adjustment(text, text, text, integer, text, text, uuid, timestamptz) from anon;
revoke all on function public.apply_inventory_adjustment(text, text, text, integer, text, text, uuid, timestamptz) from authenticated;
grant execute on function public.apply_inventory_adjustment(text, text, text, integer, text, text, uuid, timestamptz) to service_role;

revoke all on function public.order_has_checkout_reservations(uuid) from public;
revoke all on function public.order_has_checkout_reservations(uuid) from anon;
revoke all on function public.order_has_checkout_reservations(uuid) from authenticated;
grant execute on function public.order_has_checkout_reservations(uuid) to service_role;
