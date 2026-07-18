-- Free-text lead address must not fake a complete structured shipping_address.
-- Keep needs_address true until admin saves a real address via updateOrderShippingAddressWorkflow.

create or replace function public.convert_lead_to_order(
  p_lead_id uuid,
  p_actor_id uuid,
  p_address text default null,
  p_product_slug text default null,
  p_product_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_now timestamptz := now();
  v_address text;
  v_product_slug text;
  v_product_name text;
  v_has_product boolean;
  v_metadata jsonb;
  v_timeline jsonb;
  v_unit_price numeric(12, 2) := 0;
begin
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  if v_lead.status = 'converted' and v_lead.converted_order_id is not null then
    select * into v_order from public.orders where id = v_lead.converted_order_id;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_lead.converted_order_id,
      'order_number', v_order.order_number,
      'status', v_order.status
    );
  end if;

  v_address := nullif(btrim(coalesce(p_address, v_lead.address, '')), '');
  v_product_slug := nullif(btrim(coalesce(p_product_slug, v_lead.product_slug, '')), '');
  v_product_name := nullif(btrim(coalesce(p_product_name, v_lead.product_name, '')), '');
  v_has_product := v_product_slug is not null;

  if v_has_product then
    select coalesce(price, 0) into v_unit_price
    from public.mithron_products
    where slug = v_product_slug;
    v_unit_price := coalesce(v_unit_price, 0);
  end if;

  v_order_number := 'ORD-' || to_char(v_now at time zone 'utc', 'YYYYMMDD')
    || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  -- Free-text lead address is not a structured shipping address; always require admin to complete one.
  v_metadata := jsonb_build_object(
    'source', 'lead',
    'source_lead_id', p_lead_id::text,
    'lead_source', v_lead.source,
    'customer_full_name', v_lead.name,
    'customer_phone', v_lead.phone,
    'original_message', v_lead.message,
    'converted_from_lead_at', v_now,
    'needs_address', true,
    'needs_products', not v_has_product
  );

  if v_address is not null then
    v_metadata := v_metadata || jsonb_build_object('lead_address', v_address);
  end if;

  v_timeline := jsonb_build_array(
    jsonb_build_object(
      'at', v_now,
      'status', 'confirmed',
      'event', 'order.created',
      'note', 'Order created from lead.',
      'actor_id', p_actor_id,
      'metadata', jsonb_build_object('source', 'lead')
    )
  );

  insert into public.orders (
    order_number,
    customer_email,
    status,
    payment_status,
    fulfillment_status,
    channel,
    subtotal,
    total,
    currency,
    items,
    metadata,
    timeline,
    created_by,
    created_by_user_id,
    source_lead_id,
    updated_at
  )
  values (
    v_order_number,
    v_lead.email,
    'confirmed',
    'not_required',
    'pending',
    'enquiry',
    case when v_has_product then v_unit_price else 0 end,
    case when v_has_product then v_unit_price else 0 end,
    'INR',
    '[]'::jsonb,
    v_metadata,
    v_timeline,
    p_actor_id,
    v_lead.customer_user_id,
    p_lead_id,
    v_now
  )
  returning * into v_order;

  v_order_id := v_order.id;

  if v_has_product then
    insert into public.order_items (
      order_id,
      product_slug,
      product_name,
      quantity,
      unit_price,
      line_total,
      metadata
    )
    values (
      v_order_id,
      v_product_slug,
      coalesce(v_product_name, v_product_slug),
      1,
      v_unit_price,
      v_unit_price,
      jsonb_build_object('source', 'lead')
    );
  end if;

  update public.leads
  set
    status = 'converted',
    converted_order_id = v_order_id,
    address = coalesce(v_address, address),
    product_slug = coalesce(v_product_slug, product_slug),
    product_name = coalesce(v_product_name, product_name),
    updated_at = v_now
  where id = p_lead_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'row', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.convert_lead_to_order(uuid, uuid, text, text, text) from public;
grant execute on function public.convert_lead_to_order(uuid, uuid, text, text, text) to service_role;
