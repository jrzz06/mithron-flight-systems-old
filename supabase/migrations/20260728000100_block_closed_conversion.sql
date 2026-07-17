-- Block conversion of closed enquiries / contact requests into orders.
-- Gates sit after the FOR UPDATE lock and before order insert, so concurrent
-- cancel/convert races still serialize correctly on the row lock.

create or replace function public.convert_enquiry_to_order_atomic(
  p_enquiry_id uuid,
  p_actor_id uuid,
  p_order jsonb,
  p_order_items jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_timeline jsonb;
  v_now timestamptz := now();
begin
  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'enquiry_not_found');
  end if;

  if v_enquiry.converted_order_id is not null then
    select * into v_order from public.orders where id = v_enquiry.converted_order_id;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'order_id', v_enquiry.converted_order_id,
      'order_number', v_order.order_number
    );
  end if;

  -- Closed enquiries must not be converted (reverse-workflow guard).
  if v_enquiry.status = 'lost' then
    return jsonb_build_object('ok', false, 'error', 'enquiry_closed');
  end if;

  insert into public.orders (
    order_number, customer_email, status, payment_status, fulfillment_status,
    channel, subtotal, total, currency, items, metadata, timeline,
    created_by, created_by_user_id, source_enquiry_id, updated_at
  )
  values (
    coalesce(p_order->>'order_number', null),
    coalesce(p_order->>'customer_email', v_enquiry.customer_email),
    coalesce(p_order->>'status', 'admin_review'),
    coalesce(p_order->>'payment_status', 'requires_payment'),
    coalesce(p_order->>'fulfillment_status', 'pending'),
    coalesce(p_order->>'channel', 'checkout'),
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'total')::numeric, 0),
    coalesce(p_order->>'currency', 'INR'),
    coalesce(p_order->'items', '[]'::jsonb),
    coalesce(p_order->'metadata', '{}'::jsonb) || jsonb_build_object('source_enquiry_id', p_enquiry_id::text),
    coalesce(p_order->'timeline', '[]'::jsonb),
    p_actor_id,
    nullif(p_order->>'created_by_user_id', '')::uuid,
    p_enquiry_id,
    v_now
  )
  returning * into v_order;

  v_order_id := v_order.id;

  for v_item in select * from jsonb_array_elements(coalesce(p_order_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      order_id, product_slug, product_name, bundle_id, sku,
      quantity, unit_price, line_total, metadata
    )
    values (
      v_order_id,
      v_item->>'product_slug',
      v_item->>'product_name',
      nullif(v_item->>'bundle_id', ''),
      nullif(v_item->>'sku', ''),
      coalesce((v_item->>'quantity')::integer, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'line_total')::numeric, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  v_timeline := coalesce(v_enquiry.payload, '{}'::jsonb);
  v_timeline := jsonb_set(
    v_timeline, '{timeline}',
    coalesce(v_timeline->'timeline', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'at', v_now, 'action', 'converted', 'actor_id', p_actor_id,
        'summary', 'Enquiry converted to order ' || coalesce(v_order.order_number, v_order_id::text),
        'status', 'converted',
        'metadata', jsonb_build_object('idempotency_key', p_idempotency_key)
      )
    )
  );

  update public.enquiries
  set status = 'converted', converted_order_id = v_order_id, payload = v_timeline, updated_at = v_now
  where id = p_enquiry_id;

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'order_id', v_order_id, 'order_number', v_order.order_number, 'row', to_jsonb(v_order)
  );
end;
$$;

create or replace function public.convert_contact_request_to_order(
  p_contact_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.contact_requests%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_payload jsonb;
  v_has_address boolean;
  v_order_status text;
  v_payment_status text;
  v_metadata jsonb;
  v_timeline jsonb;
  v_now timestamptz := now();
begin
  select * into v_request
  from public.contact_requests
  where id = p_contact_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'contact_request_not_found');
  end if;

  if v_request.converted_order_id is not null then
    select * into v_order from public.orders where id = v_request.converted_order_id;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_request.converted_order_id,
      'order_number', v_order.order_number,
      'status', v_order.status
    );
  end if;

  -- Closed / archived contact requests must not be converted (reverse-workflow guard).
  if v_request.status in ('rejected', 'archived') or v_request.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'contact_request_closed');
  end if;

  v_payload := coalesce(v_request.payload, '{}'::jsonb);
  v_has_address := coalesce(v_payload->'shipping_address'->>'line1', '') <> ''
    or coalesce(v_payload->'guest_shipping_address'->>'line1', '') <> '';

  if v_has_address then
    v_order_status := 'admin_review';
    v_payment_status := 'requires_payment';
  else
    v_order_status := 'draft';
    v_payment_status := 'not_required';
  end if;

  v_order_number := 'ORD-' || to_char(v_now at time zone 'utc', 'YYYYMMDD')
    || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  v_metadata := jsonb_build_object(
    'source', 'contact_request',
    'source_contact_request_id', p_contact_request_id::text,
    'customer_full_name', coalesce(v_request.customer_full_name, ''),
    'customer_phone', coalesce(v_request.customer_phone, ''),
    'customer_company', coalesce(v_request.customer_company, ''),
    'subject', v_request.subject,
    'original_message', v_request.body,
    'converted_from_contact_request_at', v_now,
    'needs_address', not v_has_address,
    'needs_products', true
  );

  if v_has_address then
    v_metadata := v_metadata || jsonb_build_object(
      'shipping_address', coalesce(v_payload->'shipping_address', v_payload->'guest_shipping_address')
    );
  end if;

  v_timeline := jsonb_build_array(
    jsonb_build_object(
      'at', v_now,
      'status', v_order_status,
      'event', 'order.created',
      'note', 'Order created from contact request.',
      'actor_id', p_actor_id,
      'metadata', jsonb_build_object('source', 'contact_request')
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
    source_contact_request_id,
    updated_at
  )
  values (
    v_order_number,
    v_request.customer_email,
    v_order_status,
    v_payment_status,
    'pending',
    'contact_request',
    0,
    0,
    'INR',
    '[]'::jsonb,
    v_metadata,
    v_timeline,
    p_actor_id,
    v_request.customer_user_id,
    p_contact_request_id,
    v_now
  )
  returning * into v_order;

  v_order_id := v_order.id;

  update public.contact_requests
  set
    status = 'converted',
    converted_order_id = v_order_id,
    payload = jsonb_set(
      v_payload,
      '{timeline}',
      coalesce(v_payload->'timeline', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'at', v_now,
          'action', 'converted',
          'actor_id', p_actor_id,
          'summary', 'Contact request converted to order ' || coalesce(v_order.order_number, v_order_id::text),
          'status', 'converted'
        )
      )
    ),
    updated_at = v_now
  where id = p_contact_request_id;

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
