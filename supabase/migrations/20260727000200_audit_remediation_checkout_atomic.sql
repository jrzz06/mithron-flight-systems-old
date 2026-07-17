-- Full audit remediation Stage 1b:
-- Atomic checkout order+items creation and soft stock reservation.
-- Payment intent remains external (Razorpay/Cashfree) after this RPC.
-- Soft-reserve closes the verify-only TOCTOU window without changing
-- when physical quantity is deducted (still on fulfillment).

-- ---------------------------------------------------------------------------
-- Soft-reserve: restore real implementations (were no-ops since simplified model)
-- ---------------------------------------------------------------------------
create or replace function public.reserve_checkout_stock(
  p_order_id uuid,
  p_items jsonb,
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
  v_sellable integer;
  v_reserved integer := 0;
  v_sku text;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order % not found', p_order_id;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one checkout item is required';
  end if;

  for v_item in
    select
      btrim(elem->>'product_slug') as product_slug,
      (elem->>'quantity')::integer as quantity,
      nullif(btrim(elem->>'sku'), '') as sku
    from jsonb_array_elements(p_items) as elem
  loop
    if v_item.product_slug is null or v_item.product_slug = '' then
      raise exception 'product_slug is required for each checkout item';
    end if;

    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Invalid quantity for %', v_item.product_slug;
    end if;

    v_sku := coalesce(v_item.sku, public.derive_product_sku(v_item.product_slug));

    if exists (
      select 1
      from public.inventory_movements im
      where im.related_order_id = p_order_id
        and im.product_id = v_item.product_slug
        and im.sku is not distinct from v_sku
        and im.movement_type = 'reservation'
    ) then
      v_reserved := v_reserved + 1;
      continue;
    end if;

    select * into v_inventory
    from public.inventory
    where product_slug = v_item.product_slug
      and sku = v_sku
    for update;

    if not found then
      select * into v_inventory
      from public.inventory
      where product_slug = v_item.product_slug
      order by updated_at desc
      limit 1
      for update;
      if found then
        v_sku := v_inventory.sku;
      end if;
    end if;

    if not found then
      raise exception 'No inventory for product %', v_item.product_slug;
    end if;

    v_sellable := greatest(0, coalesce(v_inventory.quantity, 0) - coalesce(v_inventory.reserved_quantity, 0));
    if v_sellable < v_item.quantity then
      raise exception 'Insufficient stock for %: available %, requested %',
        v_item.product_slug, v_sellable, v_item.quantity;
    end if;

    update public.inventory
    set reserved_quantity = coalesce(reserved_quantity, 0) + v_item.quantity,
        updated_at = now()
    where id = v_inventory.id;

    select * into v_stock
    from public.warehouse_stock
    where product_slug = v_item.product_slug
      and warehouse_code = p_warehouse_code
      and sku = v_sku
    for update;

    if found then
      update public.warehouse_stock
      set available_quantity = greatest(0, coalesce(available_quantity, 0) - v_item.quantity),
          committed_quantity = coalesce(committed_quantity, 0) + v_item.quantity,
          updated_at = now()
      where id = v_stock.id;
    end if;

    insert into public.inventory_movements (
      product_id, sku, warehouse_code, warehouse_stock_id,
      movement_type, quantity_delta, quantity_before, quantity_after,
      reason_code, notes, related_order_id
    ) values (
      v_item.product_slug,
      v_sku,
      p_warehouse_code,
      v_stock.id,
      'reservation',
      -v_item.quantity,
      v_sellable,
      v_sellable - v_item.quantity,
      'checkout_reservation',
      format('Checkout reservation for order %s', p_order_id),
      p_order_id
    );

    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object(
    'skipped', false,
    'order_id', p_order_id,
    'rows_reserved', v_reserved
  );
end;
$$;

create or replace function public.release_checkout_stock(
  p_order_id uuid,
  p_warehouse_code text default 'IN-WEST-01'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement record;
  v_inventory public.inventory%rowtype;
  v_stock public.warehouse_stock%rowtype;
  v_released integer := 0;
  v_qty integer;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  for v_movement in
    select *
    from public.inventory_movements
    where related_order_id = p_order_id
      and movement_type = 'reservation'
      and not exists (
        select 1 from public.inventory_movements im2
        where im2.related_order_id = p_order_id
          and im2.product_id = inventory_movements.product_id
          and im2.sku is not distinct from inventory_movements.sku
          and im2.movement_type in ('reservation_release', 'fulfillment')
      )
  loop
    v_qty := abs(coalesce(v_movement.quantity_delta, 0));
    if v_qty <= 0 then
      continue;
    end if;

    select * into v_inventory
    from public.inventory
    where product_slug = v_movement.product_id
      and sku is not distinct from v_movement.sku
    for update;

    if found then
      update public.inventory
      set reserved_quantity = greatest(0, coalesce(reserved_quantity, 0) - v_qty),
          updated_at = now()
      where id = v_inventory.id;
    end if;

    select * into v_stock
    from public.warehouse_stock
    where product_slug = v_movement.product_id
      and warehouse_code = coalesce(v_movement.warehouse_code, p_warehouse_code)
      and sku is not distinct from v_movement.sku
    for update;

    if found then
      update public.warehouse_stock
      set available_quantity = coalesce(available_quantity, 0) + v_qty,
          committed_quantity = greatest(0, coalesce(committed_quantity, 0) - v_qty),
          updated_at = now()
      where id = v_stock.id;
    end if;

    insert into public.inventory_movements (
      product_id, sku, warehouse_code, warehouse_stock_id,
      movement_type, quantity_delta, quantity_before, quantity_after,
      reason_code, notes, related_order_id
    ) values (
      v_movement.product_id,
      v_movement.sku,
      coalesce(v_movement.warehouse_code, p_warehouse_code),
      v_stock.id,
      'reservation_release',
      v_qty,
      coalesce(v_stock.available_quantity, 0),
      coalesce(v_stock.available_quantity, 0) + v_qty,
      'checkout_release',
      format('Release reservation for cancelled/expired order %s', p_order_id),
      p_order_id
    );

    v_released := v_released + 1;
  end loop;

  return jsonb_build_object(
    'skipped', false,
    'order_id', p_order_id,
    'rows_released', v_released
  );
end;
$$;

revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from public;
revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from anon;
revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from authenticated;
grant execute on function public.reserve_checkout_stock(uuid, jsonb, text) to service_role;

revoke all on function public.release_checkout_stock(uuid, text) from public;
revoke all on function public.release_checkout_stock(uuid, text) from anon;
revoke all on function public.release_checkout_stock(uuid, text) from authenticated;
grant execute on function public.release_checkout_stock(uuid, text) to service_role;

-- Fulfillment: deduct quantity and release matching reservation for this order only
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
  v_reserved_before integer;
  v_deducted integer := 0;
  v_sku text;
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

    if not found then
      select * into v_inventory
      from public.inventory
      where product_slug = v_item.product_slug
      order by updated_at desc
      limit 1
      for update;
      if found then
        v_sku := v_inventory.sku;
      end if;
    end if;

    v_qty_before := coalesce(v_inventory.quantity, 0);
    v_reserved_before := coalesce(v_inventory.reserved_quantity, 0);
    v_qty_after := greatest(0, v_qty_before - v_item.quantity);

    if found then
      update public.inventory
      set quantity = v_qty_after,
          stock_status = case when v_qty_after > 0 then 'available' else 'out_of_stock' end,
          reserved_quantity = greatest(0, v_reserved_before - v_item.quantity),
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
      set available_quantity = greatest(0, coalesce(available_quantity, 0)),
          committed_quantity = greatest(0, coalesce(committed_quantity, 0) - v_item.quantity),
          updated_at = now()
      where id = v_stock.id;

      -- Keep warehouse available aligned with sellable inventory
      update public.warehouse_stock
      set available_quantity = greatest(
            0,
            (
              select greatest(0, coalesce(i.quantity, 0) - coalesce(i.reserved_quantity, 0))
              from public.inventory i
              where i.product_slug = v_item.product_slug
                and i.sku = v_sku
              limit 1
            )
          ),
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
    'rows_deducted', v_deducted
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic create: order + order_items + soft-reserve in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.create_checkout_order(
  p_order jsonb,
  p_order_items jsonb,
  p_warehouse_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_warehouse text;
  v_item jsonb;
  v_reserve jsonb;
  v_items_for_reserve jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_order) <> 'object' then
    raise exception 'order payload is required';
  end if;
  if jsonb_typeof(p_order_items) <> 'array' or jsonb_array_length(p_order_items) = 0 then
    raise exception 'order_items payload is required';
  end if;

  v_warehouse := coalesce(
    nullif(btrim(p_warehouse_code), ''),
    (
      select wc.checkout_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    public.resolve_default_warehouse_code()
  );

  v_order_number := coalesce(nullif(btrim(p_order->>'order_number'), ''), format('ORD-%s', replace(gen_random_uuid()::text, '-', '')));

  insert into public.orders (
    order_number,
    status,
    payment_status,
    fulfillment_status,
    customer_email,
    channel,
    subtotal,
    total,
    currency,
    items,
    created_by_user_id,
    created_by,
    shipping_address_id,
    billing_address_id,
    metadata,
    timeline
  )
  values (
    v_order_number,
    coalesce(nullif(btrim(p_order->>'status'), ''), 'pending_payment'),
    coalesce(nullif(btrim(p_order->>'payment_status'), ''), 'requires_payment'),
    coalesce(nullif(btrim(p_order->>'fulfillment_status'), ''), 'pending'),
    p_order->>'customer_email',
    coalesce(nullif(btrim(p_order->>'channel'), ''), 'checkout'),
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'total')::numeric, 0),
    coalesce(nullif(btrim(p_order->>'currency'), ''), 'INR'),
    coalesce(p_order->'items', p_order_items, '[]'::jsonb),
    coalesce(
      nullif(p_order->>'created_by_user_id', '')::uuid,
      nullif(p_order #>> '{metadata,created_by_user_id}', '')::uuid
    ),
    coalesce(
      nullif(p_order->>'created_by', '')::uuid,
      nullif(p_order->>'created_by_user_id', '')::uuid,
      nullif(p_order #>> '{metadata,created_by_user_id}', '')::uuid
    ),
    nullif(p_order->>'shipping_address_id', '')::uuid,
    nullif(p_order->>'billing_address_id', '')::uuid,
    coalesce(p_order->'metadata', '{}'::jsonb),
    coalesce(p_order->'timeline', '[]'::jsonb)
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_order_items)
  loop
    insert into public.order_items (
      order_id,
      product_slug,
      product_name,
      bundle_id,
      sku,
      quantity,
      unit_price,
      line_total,
      metadata
    )
    values (
      v_order_id,
      v_item->>'product_slug',
      coalesce(nullif(btrim(v_item->>'product_name'), ''), v_item->>'product_slug'),
      nullif(v_item->>'bundle_id', ''),
      nullif(v_item->>'sku', ''),
      coalesce((v_item->>'quantity')::integer, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'line_total')::numeric, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );

    v_items_for_reserve := v_items_for_reserve || jsonb_build_array(
      jsonb_build_object(
        'product_slug', v_item->>'product_slug',
        'quantity', coalesce((v_item->>'quantity')::integer, 1),
        'sku', nullif(v_item->>'sku', '')
      )
    );
  end loop;

  v_reserve := public.reserve_checkout_stock(v_order_id, v_items_for_reserve, v_warehouse);

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'reservation', v_reserve
  );
exception
  when unique_violation then
    raise;
  when others then
    raise;
end;
$$;

revoke all on function public.create_checkout_order(jsonb, jsonb, text) from public;
revoke all on function public.create_checkout_order(jsonb, jsonb, text) from anon;
revoke all on function public.create_checkout_order(jsonb, jsonb, text) from authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text) to service_role;
