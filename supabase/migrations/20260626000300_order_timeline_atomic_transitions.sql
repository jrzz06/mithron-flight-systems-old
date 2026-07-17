-- Order timeline RPCs (missing from production) + atomic status/timeline transitions.

create or replace function public.append_order_timeline_entry(
  p_order_id uuid,
  p_entry jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_timeline jsonb;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;

  if p_expected_updated_at is not null
     and v_order.updated_at is not null
     and v_order.updated_at <> p_expected_updated_at then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'current_row', to_jsonb(v_order),
      'current_updated_at', v_order.updated_at
    );
  end if;

  v_timeline := coalesce(v_order.timeline, '[]'::jsonb) || jsonb_build_array(coalesce(p_entry, '{}'::jsonb));

  update public.orders
  set timeline = v_timeline,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object('ok', true, 'conflict', false, 'row', to_jsonb(v_order));
end;
$$;

create or replace function public.transition_order_with_timeline(
  p_order_id uuid,
  p_entry jsonb,
  p_status text default null,
  p_fulfillment_status text default null,
  p_payment_status text default null,
  p_expected_updated_at timestamptz default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_timeline jsonb;
  v_entry jsonb;
  v_existing jsonb;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;

  if p_expected_updated_at is not null
     and v_order.updated_at is not null
     and v_order.updated_at <> p_expected_updated_at then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'current_row', to_jsonb(v_order),
      'current_updated_at', v_order.updated_at
    );
  end if;

  if p_idempotency_key is not null then
    select elem into v_existing
    from jsonb_array_elements(coalesce(v_order.timeline, '[]'::jsonb)) as elem
    where coalesce(elem->'metadata'->>'idempotency_key', '') = p_idempotency_key
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'conflict', false,
        'duplicate', true,
        'row', to_jsonb(v_order)
      );
    end if;
  end if;

  v_entry := coalesce(p_entry, '{}'::jsonb);
  if p_idempotency_key is not null then
    v_entry := jsonb_set(
      v_entry,
      '{metadata}',
      coalesce(v_entry->'metadata', '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key),
      true
    );
  end if;

  v_timeline := coalesce(v_order.timeline, '[]'::jsonb) || jsonb_build_array(v_entry);

  update public.orders
  set timeline = v_timeline,
      status = coalesce(p_status, status),
      fulfillment_status = coalesce(p_fulfillment_status, fulfillment_status),
      payment_status = coalesce(p_payment_status, payment_status),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'duplicate', false,
    'row', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from public;
revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from anon;
revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from authenticated;
grant execute on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) to service_role;

revoke all on function public.transition_order_with_timeline(uuid, jsonb, text, text, text, timestamptz, text) from public;
revoke all on function public.transition_order_with_timeline(uuid, jsonb, text, text, text, timestamptz, text) from anon;
revoke all on function public.transition_order_with_timeline(uuid, jsonb, text, text, text, timestamptz, text) from authenticated;
grant execute on function public.transition_order_with_timeline(uuid, jsonb, text, text, text, timestamptz, text) to service_role;
