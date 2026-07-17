-- Production commerce hardening: atomic checkout stock reservation, RBAC alignment, movement types.

-- Extend inventory movement types for checkout reservation lifecycle.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_chk;
alter table public.inventory_movements add constraint inventory_movements_movement_type_chk check (
  movement_type in (
    'stock_in',
    'stock_out',
    'adjustment',
    'transfer',
    'fulfillment',
    'return',
    'damaged',
    'correction',
    'reservation',
    'reservation_release'
  )
);

-- Idempotent reservation ledger per order line.
create unique index if not exists inventory_movements_checkout_reservation_uidx
  on public.inventory_movements (related_order_id, product_id, sku, movement_type)
  where movement_type in ('reservation', 'reservation_release') and related_order_id is not null;

-- Align has_cms_permission with recursive role inheritance + disabled-profile gate.
create or replace function public.has_cms_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive role_tree(role_key) as (
    select ur.role_key
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and p.governance_status is distinct from 'disabled'
    union
    select ri.inherited_role_key
    from public.role_inheritance ri
    join role_tree rt on rt.role_key = ri.role_key
  )
  select exists (
    select 1
    from role_tree rt
    left join public.role_permissions rp on rp.role_key = rt.role_key
    where rt.role_key = 'super_admin'
       or rp.permission_key = required_permission
  );
$$;

revoke all on function public.has_cms_permission(text) from public;
revoke all on function public.has_cms_permission(text) from anon;
grant execute on function public.has_cms_permission(text) to authenticated, service_role;

-- Align has_any_cms_permission with disabled-profile gate.
create or replace function public.has_any_cms_permission(required_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive role_tree(role_key) as (
    select ur.role_key
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and p.governance_status is distinct from 'disabled'
    union
    select ri.inherited_role_key
    from public.role_inheritance ri
    join role_tree rt on rt.role_key = ri.role_key
  )
  select exists (
    select 1
    from role_tree rt
    left join public.role_permissions rp on rp.role_key = rt.role_key
    where rt.role_key = 'super_admin'
       or rp.permission_key = any(coalesce(required_permissions, array[]::text[]))
  );
$$;

revoke all on function public.has_any_cms_permission(text[]) from public;
revoke all on function public.has_any_cms_permission(text[]) from anon;
grant execute on function public.has_any_cms_permission(text[]) to authenticated, service_role;

-- Atomically reserve stock for checkout (SELECT … FOR UPDATE).
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
  v_stock public.warehouse_stock%rowtype;
  v_qty_before integer;
  v_qty_after integer;
  v_reserved integer := 0;
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

    if v_item.sku is not null then
      select * into v_stock
      from public.warehouse_stock
      where product_slug = v_item.product_slug
        and warehouse_code = p_warehouse_code
        and sku = v_item.sku
      for update;
    else
      select * into v_stock
      from public.warehouse_stock
      where product_slug = v_item.product_slug
        and warehouse_code = p_warehouse_code
      order by available_quantity desc, sku asc
      limit 1
      for update;
    end if;

    if not found then
      raise exception 'No warehouse stock for product % in %', v_item.product_slug, p_warehouse_code;
    end if;

    v_qty_before := coalesce(v_stock.available_quantity, 0);
    if v_qty_before < v_item.quantity then
      raise exception 'Insufficient stock for %: available %, requested %',
        v_item.product_slug, v_qty_before, v_item.quantity;
    end if;

    v_qty_after := v_qty_before - v_item.quantity;

    update public.warehouse_stock
    set available_quantity = v_qty_after,
        committed_quantity = coalesce(committed_quantity, 0) + v_item.quantity,
        updated_at = now()
    where id = v_stock.id;

    update public.inventory
    set reserved_quantity = coalesce(reserved_quantity, 0) + v_item.quantity,
        updated_at = now()
    where product_slug = v_item.product_slug
      and sku is not distinct from v_stock.sku;

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
      related_order_id
    ) values (
      v_item.product_slug,
      coalesce(v_stock.sku, v_item.sku, v_item.product_slug),
      p_warehouse_code,
      v_stock.id,
      'reservation',
      -v_item.quantity,
      v_qty_before,
      v_qty_after,
      'checkout_reservation',
      format('Checkout reservation for order %s', p_order_id),
      p_order_id
    )
    on conflict do nothing;

    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object(
    'order_id', p_order_id,
    'rows_reserved', v_reserved,
    'warehouse_code', p_warehouse_code
  );
end;
$$;

revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from public;
revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from anon;
revoke all on function public.reserve_checkout_stock(uuid, jsonb, text) from authenticated;
grant execute on function public.reserve_checkout_stock(uuid, jsonb, text) to service_role;

-- Release reserved stock when checkout is cancelled or payment fails.
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
  v_stock public.warehouse_stock%rowtype;
  v_qty_before integer;
  v_qty_after integer;
  v_released integer := 0;
  v_release_qty integer;
begin
  for v_movement in
    select *
    from public.inventory_movements
    where related_order_id = p_order_id
      and movement_type = 'reservation'
      and not exists (
        select 1
        from public.inventory_movements rel
        where rel.related_order_id = p_order_id
          and rel.product_id = inventory_movements.product_id
          and rel.sku = inventory_movements.sku
          and rel.movement_type = 'reservation_release'
      )
  loop
    v_release_qty := abs(v_movement.quantity_delta);

    select * into v_stock
    from public.warehouse_stock
    where id = v_movement.warehouse_stock_id
    for update;

    if found then
      v_qty_before := coalesce(v_stock.available_quantity, 0);
      v_qty_after := v_qty_before + v_release_qty;

      update public.warehouse_stock
      set available_quantity = v_qty_after,
          committed_quantity = greatest(0, coalesce(committed_quantity, 0) - v_release_qty),
          updated_at = now()
      where id = v_stock.id;

      update public.inventory
      set reserved_quantity = greatest(0, coalesce(reserved_quantity, 0) - v_release_qty),
          updated_at = now()
      where product_slug = v_movement.product_id
        and sku is not distinct from v_movement.sku;

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
        related_order_id
      ) values (
        v_movement.product_id,
        v_movement.sku,
        coalesce(v_movement.warehouse_code, p_warehouse_code),
        v_stock.id,
        'reservation_release',
        v_release_qty,
        v_qty_before,
        v_qty_after,
        'checkout_reservation_release',
        format('Released checkout reservation for order %s', p_order_id),
        p_order_id
      );
    end if;

    v_released := v_released + 1;
  end loop;

  return jsonb_build_object('order_id', p_order_id, 'rows_released', v_released);
end;
$$;

revoke all on function public.release_checkout_stock(uuid, text) from public;
revoke all on function public.release_checkout_stock(uuid, text) from anon;
revoke all on function public.release_checkout_stock(uuid, text) from authenticated;
grant execute on function public.release_checkout_stock(uuid, text) to service_role;

notify pgrst, 'reload schema';
