-- Harden fulfillment inventory deduction against overselling.
--
-- Previously deduct_order_inventory_on_fulfillment computed
--   v_qty_after := greatest(0, v_qty_before - v_item.quantity)
-- which silently clamped stock to zero when an order asked for more units than
-- were on hand. Combined with verify-only checkout (no reservation), two
-- concurrent orders for the last unit could both be created and both "fulfilled"
-- while inventory quietly floored at zero — i.e. an oversell that only surfaced
-- as a physical shortage.
--
-- This redefinition makes the deduction atomic and fail-hard: the inventory row
-- is locked FOR UPDATE (serialising concurrent fulfillments), and if the locked
-- on-hand quantity is less than the requested quantity the function raises,
-- rolling back the entire fulfillment transaction. The warehouse action that
-- calls this RPC runs the deduction before persisting the fulfillment status
-- transition, so a raise here prevents the order from being marked fulfilled.

create or replace function public.deduct_order_inventory_on_fulfillment(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_warehouse_code text default 'IN-WEST-01'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_inventory public.inventory%rowtype;
  v_stock public.warehouse_stock%rowtype;
  v_qty_before integer;
  v_qty_after integer;
  v_deducted integer := 0;
  v_sku text;
  v_inventory_found boolean;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  for v_item in
    select product_slug, sku, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    if exists (
      select 1 from public.inventory_movements im
      where im.related_order_id = p_order_id
        and im.product_id = v_item.product_slug
        and im.sku is not distinct from v_item.sku
        and im.movement_type = 'fulfillment'
    ) then
      continue;
    end if;

    v_sku := coalesce(nullif(btrim(v_item.sku), ''), public.derive_product_sku(v_item.product_slug));

    select * into v_inventory
    from public.inventory
    where product_slug = v_item.product_slug and sku = v_sku
    for update;

    v_inventory_found := found;

    if not v_inventory_found then
      select * into v_inventory
      from public.inventory
      where product_slug = v_item.product_slug
      order by updated_at desc
      limit 1
      for update;
      v_inventory_found := found;
    end if;

    v_qty_before := coalesce(v_inventory.quantity, 0);

    -- Fail hard on insufficient stock for tracked products rather than clamping
    -- to zero. Untracked products (no inventory row) are left to legacy behaviour
    -- because verify-only checkout already treats them as out of stock.
    if v_inventory_found and v_qty_before < v_item.quantity then
      raise exception
        'Insufficient stock to fulfill % (sku %): on hand %, requested %.',
        v_item.product_slug, v_sku, v_qty_before, v_item.quantity
        using errcode = 'check_violation';
    end if;

    v_qty_after := greatest(0, v_qty_before - v_item.quantity);

    if v_inventory_found then
      update public.inventory
      set quantity = v_qty_after,
          stock_status = case when v_qty_after > 0 then 'available' else 'out_of_stock' end,
          reserved_quantity = 0,
          reorder_threshold = 0,
          updated_at = now()
      where id = v_inventory.id;
    end if;

    select * into v_stock
    from public.warehouse_stock
    where product_slug = v_item.product_slug
      and warehouse_code = p_warehouse_code
      and sku = v_sku
    for update;

    if found then
      update public.warehouse_stock
      set available_quantity = v_qty_after,
          committed_quantity = 0,
          updated_at = now()
      where id = v_stock.id;
    end if;

    update public.mithron_products
    set source_availability = case when v_qty_after > 0 then 'In stock' else 'Out of stock' end,
        updated_at = now()
    where slug = v_item.product_slug;

    insert into public.inventory_movements (
      product_id, sku, warehouse_code, warehouse_stock_id,
      movement_type, quantity_delta, quantity_before, quantity_after,
      reason_code, actor_user_id, related_order_id
    ) values (
      v_item.product_slug,
      v_sku,
      p_warehouse_code,
      v_stock.id,
      'fulfillment',
      -v_item.quantity,
      v_qty_before,
      v_qty_after,
      'order_fulfillment',
      p_actor_id,
      p_order_id
    );

    v_deducted := v_deducted + 1;
  end loop;

  return jsonb_build_object(
    'order_id', p_order_id,
    'rows_deducted', v_deducted,
    'warehouse_code', p_warehouse_code
  );
end;
$$;

grant execute on function public.deduct_order_inventory_on_fulfillment(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
