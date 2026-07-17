-- Defense-in-depth: re-validate checkout line unit_price against mithron_products
-- inside create_checkout_order. Callers already price server-side; this rejects
-- mismatched payloads even when invoked via service_role.

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
  v_slug text;
  v_qty integer;
  v_unit_price numeric;
  v_catalog_price numeric;
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
    v_slug := nullif(btrim(v_item->>'product_slug'), '');
    if v_slug is null then
      raise exception 'order item product_slug is required';
    end if;

    v_qty := coalesce((v_item->>'quantity')::integer, 1);
    if v_qty is null or v_qty <= 0 then
      raise exception 'order item quantity must be a positive integer for %', v_slug;
    end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);

    select mp.price
      into v_catalog_price
    from public.mithron_products mp
    where mp.slug = v_slug
    limit 1;

    if v_catalog_price is null then
      raise exception 'Unknown product slug in checkout order: %', v_slug;
    end if;

    -- Allow 1 paise tolerance for numeric serialization differences.
    if abs(v_unit_price - v_catalog_price) > 0.01 then
      raise exception 'Checkout unit_price mismatch for %: payload % catalog %',
        v_slug, v_unit_price, v_catalog_price;
    end if;

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
      v_slug,
      coalesce(nullif(btrim(v_item->>'product_name'), ''), v_slug),
      nullif(v_item->>'bundle_id', ''),
      nullif(v_item->>'sku', ''),
      v_qty,
      v_catalog_price,
      coalesce((v_item->>'line_total')::numeric, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );

    v_items_for_reserve := v_items_for_reserve || jsonb_build_array(
      jsonb_build_object(
        'product_slug', v_slug,
        'quantity', v_qty,
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
