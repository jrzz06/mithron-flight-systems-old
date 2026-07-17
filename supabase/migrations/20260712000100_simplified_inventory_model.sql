-- Simplified inventory model: inventory.quantity is the single source of truth.
-- Reserved/committed/reorder are zeroed and ignored; stock deducts only on fulfillment.

update public.inventory
set
  reserved_quantity = 0,
  reorder_threshold = 0,
  stock_status = case when coalesce(quantity, 0) > 0 then 'available' else 'out_of_stock' end,
  updated_at = now();

update public.warehouse_stock ws
set
  committed_quantity = 0,
  available_quantity = coalesce((
    select i.quantity
    from public.inventory i
    where i.product_slug = ws.product_slug
    order by i.updated_at desc nulls last
    limit 1
  ), 0),
  updated_at = now();

update public.mithron_products p
set
  source_availability = case
    when coalesce((
      select i.quantity from public.inventory i where i.product_slug = p.slug order by i.updated_at desc limit 1
    ), 0) > 0 then 'In stock'
    else 'Out of stock'
  end,
  updated_at = now()
where exists (select 1 from public.inventory i where i.product_slug = p.slug);

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
  v_stock_status text;
  v_availability text;
begin
  if coalesce(trim(p_product_slug), '') = '' then
    raise exception 'product_slug is required';
  end if;
  if coalesce(trim(p_warehouse_code), '') = '' then
    raise exception 'warehouse_code is required';
  end if;
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  if not exists (select 1 from public.mithron_products p where p.slug = p_product_slug) then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_sku := coalesce(nullif(trim(p_sku), ''), public.derive_product_sku(p_product_slug));
  v_stock_status := case when p_quantity > 0 then 'available' else 'out_of_stock' end;
  v_availability := case when p_quantity > 0 then 'In stock' else 'Out of stock' end;

  insert into public.inventory (
    product_slug, sku, variant_id, stock_status, quantity,
    reserved_quantity, reorder_threshold, updated_by, updated_at
  )
  values (
    p_product_slug, v_sku, p_variant_id, v_stock_status, p_quantity,
    0, 0, p_updated_by, now()
  )
  on conflict (product_slug, sku) do update set
    variant_id = coalesce(excluded.variant_id, inventory.variant_id),
    stock_status = excluded.stock_status,
    quantity = excluded.quantity,
    reserved_quantity = 0,
    reorder_threshold = 0,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.warehouse_stock (
    warehouse_code, product_slug, sku, variant_id,
    available_quantity, committed_quantity, updated_by, updated_at, last_counted_at
  )
  values (
    p_warehouse_code, p_product_slug, v_sku, p_variant_id,
    p_quantity, 0, p_updated_by, now(), now()
  )
  on conflict (warehouse_code, product_slug, sku) do update set
    variant_id = coalesce(excluded.variant_id, warehouse_stock.variant_id),
    available_quantity = excluded.available_quantity,
    committed_quantity = 0,
    updated_by = excluded.updated_by,
    updated_at = now(),
    last_counted_at = now();

  update public.mithron_products
  set source_availability = v_availability, updated_at = now()
  where slug = p_product_slug;

  return jsonb_build_object(
    'ok', true,
    'product_slug', p_product_slug,
    'sku', v_sku,
    'stock_status', v_stock_status,
    'quantity', p_quantity,
    'available_quantity', p_quantity,
    'committed_quantity', 0,
    'warehouse_code', p_warehouse_code
  );
end;
$$;

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
begin
  return jsonb_build_object('skipped', true, 'order_id', p_order_id, 'rows_reserved', 0);
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
begin
  return jsonb_build_object('skipped', true, 'order_id', p_order_id, 'rows_released', 0);
end;
$$;

create or replace function public.fulfill_reserved_stock(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_warehouse_code text default 'IN-WEST-01'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('skipped', true, 'order_id', p_order_id, 'reason', 'use_deduct_order_inventory_on_fulfillment');
end;
$$;

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
    end if;

    v_qty_before := coalesce(v_inventory.quantity, 0);
    v_qty_after := greatest(0, v_qty_before - v_item.quantity);

    if found then
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

alter table public.warehouse_configuration
  add column if not exists stock_deduction_trigger text default 'dispatched';

update public.warehouse_configuration
set stock_deduction_trigger = coalesce(nullif(btrim(stock_deduction_trigger), ''), 'dispatched');

-- Payment confirmation must not deduct inventory; fulfillment handles stock.
create or replace function public.confirm_verified_payment(
  p_payment_id uuid,
  p_order_id uuid,
  p_provider text,
  p_provider_intent_id text,
  p_provider_payment_id text,
  p_gateway_payload jsonb default '{}'::jsonb,
  p_source text default 'verify',
  p_payment_method text default null,
  p_event_id text default null,
  p_warehouse_code text default null,
  p_verified_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_metadata jsonb;
  v_timeline_entry jsonb;
  v_transition jsonb;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  if v_payment.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_verified');
  end if;

  if coalesce(v_order.status, '') not in ('pending_payment', 'paid', 'admin_review', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'order_not_payable', 'order_status', v_order.status);
  end if;

  v_metadata := coalesce(v_payment.webhook_payload, '{}'::jsonb)
    || coalesce(p_gateway_payload, '{}'::jsonb)
    || jsonb_build_object(
      'verified_source', coalesce(p_source, 'verify'),
      'verified_at', p_verified_at,
      'payment_method', p_payment_method
    );

  update public.payments
  set status = 'succeeded',
      provider_intent_id = coalesce(nullif(p_provider_intent_id, ''), provider_intent_id),
      provider_payment_id = coalesce(nullif(p_provider_payment_id, ''), provider_payment_id),
      webhook_payload = v_metadata,
      verified_at = p_verified_at,
      updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  v_timeline_entry := jsonb_build_object(
    'at', to_jsonb(p_verified_at),
    'event', 'payment.succeeded',
    'status', case when coalesce(v_order.status, '') = 'pending_payment' then 'paid' else v_order.status end,
    'note', format('Payment verified via %s.', coalesce(p_source, 'verify')),
    'actor_id', null,
    'metadata', jsonb_build_object(
      'provider', p_provider,
      'provider_intent_id', p_provider_intent_id,
      'provider_payment_id', p_provider_payment_id,
      'payment_method', p_payment_method,
      'idempotency_key', p_event_id
    )
  );

  v_transition := public.transition_order_with_timeline(
    p_order_id,
    v_timeline_entry,
    case when coalesce(v_order.status, '') = 'pending_payment' then 'paid' else null end,
    null,
    'succeeded',
    null,
    p_event_id
  );

  if coalesce(v_transition->>'ok', 'false') <> 'true' then
    raise exception 'Order transition failed: %', v_transition;
  end if;

  insert into public.activity_logs (
    actor_id, action, entity_table, entity_id, severity, metadata
  ) values (
    null,
    'payment.verified',
    'orders',
    p_order_id::text,
    'info',
    jsonb_build_object(
      'provider', p_provider,
      'provider_intent_id', p_provider_intent_id,
      'provider_payment_id', p_provider_payment_id,
      'payment_method', p_payment_method,
      'source', p_source,
      'event_id', p_event_id,
      'inventory_skipped', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'order_id', p_order_id,
    'payment_id', p_payment_id,
    'order_status', coalesce(v_transition->'row'->>'status', 'paid'),
    'inventory', jsonb_build_object('skipped', true)
  );
end;
$$;
