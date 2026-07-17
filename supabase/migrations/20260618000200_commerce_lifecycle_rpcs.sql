-- Commerce lifecycle RPCs: idempotent reservation, fulfillment without double-deduct, webhook idempotency, FKs.

create table if not exists public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.payment_webhook_events enable row level security;

create policy "payment_webhook_events service role"
  on public.payment_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

-- Idempotent checkout reservation (skip lines already reserved for this order).
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

    if v_item.sku is not null then
      select * into v_stock
      from public.warehouse_stock
      where product_slug = v_item.product_slug
        and warehouse_code = p_warehouse_code
        and sku = v_item.sku
      for update;
      v_sku := v_item.sku;
    else
      select * into v_stock
      from public.warehouse_stock
      where product_slug = v_item.product_slug
        and warehouse_code = p_warehouse_code
      order by available_quantity desc, sku asc
      limit 1
      for update;
      v_sku := coalesce(v_stock.sku, v_item.product_slug);
    end if;

    if not found then
      raise exception 'No warehouse stock for product % in %', v_item.product_slug, p_warehouse_code;
    end if;

    v_sku := coalesce(v_stock.sku, v_sku, v_item.product_slug);

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
      v_sku,
      p_warehouse_code,
      v_stock.id,
      'reservation',
      -v_item.quantity,
      v_qty_before,
      v_qty_after,
      'checkout_reservation',
      format('Checkout reservation for order %s', p_order_id),
      p_order_id
    );

    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object(
    'order_id', p_order_id,
    'rows_reserved', v_reserved,
    'warehouse_code', p_warehouse_code
  );
end;
$$;

-- Fulfill reserved stock: decrement committed + reserved only (do not touch available again).
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
declare
  v_movement record;
  v_stock public.warehouse_stock%rowtype;
  v_inventory public.inventory%rowtype;
  v_committed_after integer;
  v_reserved_after integer;
  v_fulfilled integer := 0;
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
        select 1
        from public.inventory_movements f
        where f.related_order_id = p_order_id
          and f.product_id = inventory_movements.product_id
          and f.sku is not distinct from inventory_movements.sku
          and f.movement_type = 'fulfillment'
      )
  loop
    select * into v_stock
    from public.warehouse_stock
    where id = v_movement.warehouse_stock_id
    for update;

    if not found then
      raise exception 'warehouse_stock missing for movement %', v_movement.id;
    end if;

    v_committed_after := greatest(0, coalesce(v_stock.committed_quantity, 0) - abs(v_movement.quantity_delta));
    v_reserved_after := greatest(0, coalesce(v_stock.committed_quantity, 0) - abs(v_movement.quantity_delta));

    update public.warehouse_stock
    set committed_quantity = v_committed_after,
        updated_at = now()
    where id = v_stock.id;

    select * into v_inventory
    from public.inventory
    where product_slug = v_movement.product_id
      and sku is not distinct from v_movement.sku
    for update;

    if found then
      update public.inventory
      set reserved_quantity = greatest(0, coalesce(reserved_quantity, 0) - abs(v_movement.quantity_delta)),
          updated_at = now()
      where product_slug = v_movement.product_id
        and sku is not distinct from v_movement.sku;
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
      related_order_id,
      actor_user_id
    ) values (
      v_movement.product_id,
      v_movement.sku,
      p_warehouse_code,
      v_stock.id,
      'fulfillment',
      0,
      coalesce(v_stock.available_quantity, 0),
      coalesce(v_stock.available_quantity, 0),
      'order_fulfillment',
      format('Fulfillment for order %s (committed release)', p_order_id),
      p_order_id,
      p_actor_id
    );

    v_fulfilled := v_fulfilled + 1;
  end loop;

  return jsonb_build_object('order_id', p_order_id, 'rows_fulfilled', v_fulfilled);
end;
$$;

revoke all on function public.fulfill_reserved_stock(uuid, uuid, text) from public;
revoke all on function public.fulfill_reserved_stock(uuid, uuid, text) from anon;
revoke all on function public.fulfill_reserved_stock(uuid, uuid, text) from authenticated;
grant execute on function public.fulfill_reserved_stock(uuid, uuid, text) to service_role;

-- Foreign keys for data integrity.
alter table public.warehouse_stock
  drop constraint if exists warehouse_stock_product_slug_fk;

alter table public.warehouse_stock
  add constraint warehouse_stock_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete restrict
  not valid;

alter table public.order_items
  drop constraint if exists order_items_product_slug_fk;

alter table public.order_items
  add constraint order_items_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete restrict
  not valid;

-- Ensure status column exists before status-scoped public read policy.
alter table public.mithron_assets
  add column if not exists status text not null default 'published';

-- Restrict public asset reads to generated/published assets.
drop policy if exists "mithron_assets public read" on public.mithron_assets;

create policy "mithron_assets public read"
  on public.mithron_assets
  for select
  to anon, authenticated
  using (status in ('generated', 'published'));
