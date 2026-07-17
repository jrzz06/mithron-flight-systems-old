-- Allow payment recovery when an order was incorrectly cancelled/failed before gateway success was recorded.

create or replace function public.confirm_verified_payment(
  p_payment_id uuid,
  p_order_id uuid,
  p_provider text,
  p_provider_intent_id text,
  p_provider_payment_id text,
  p_gateway_payload jsonb default '{}'::jsonb,
  p_event_id text default null,
  p_source text default 'verify',
  p_warehouse_code text default null,
  p_payment_method text default null,
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
  v_warehouse text;
  v_timeline_entry jsonb;
  v_transition jsonb;
  v_fulfill jsonb;
  v_metadata jsonb;
  v_new_event text;
  v_existing_payment_status text;
  v_recovering boolean;
  v_next_order_status text;
begin
  if p_payment_id is null or p_order_id is null then
    raise exception 'payment_id and order_id are required';
  end if;

  if p_event_id is not null then
    insert into public.payment_webhook_events (provider, event_id, payload, processed_at)
    values (
      coalesce(nullif(btrim(p_provider), ''), 'unknown'),
      p_event_id,
      coalesce(p_gateway_payload, '{}'::jsonb),
      now()
    )
    on conflict (provider, event_id) do nothing
    returning event_id into v_new_event;

    if v_new_event is null then
      select status into v_existing_payment_status
      from public.payments
      where id = p_payment_id;

      if v_existing_payment_status = 'succeeded' then
        return jsonb_build_object(
          'ok', true,
          'skipped', true,
          'reason', 'duplicate_event',
          'order_id', p_order_id,
          'payment_id', p_payment_id
        );
      end if;
    end if;
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  if v_payment.order_id is distinct from p_order_id then
    return jsonb_build_object('ok', false, 'error', 'payment_order_mismatch');
  end if;

  if coalesce(v_payment.provider_intent_id, '') <> coalesce(p_provider_intent_id, '') then
    return jsonb_build_object('ok', false, 'error', 'provider_intent_mismatch');
  end if;

  if v_payment.status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'already_paid',
      'order_id', p_order_id,
      'payment_id', p_payment_id
    );
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  v_recovering := coalesce(v_order.status, '') = 'cancelled'
    and coalesce(v_order.payment_status, '') <> 'succeeded';

  if coalesce(v_order.status, '') not in ('pending_payment', 'paid', 'admin_review', 'confirmed')
     and not v_recovering then
    return jsonb_build_object(
      'ok', false,
      'error', 'order_not_payable',
      'order_status', v_order.status
    );
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

  v_next_order_status := case
    when coalesce(v_order.status, '') in ('pending_payment', 'cancelled') then 'paid'
    else v_order.status
  end;

  v_timeline_entry := jsonb_build_object(
    'at', to_jsonb(p_verified_at),
    'event', case when v_recovering then 'payment.recovered_after_false_failure' else 'payment.succeeded' end,
    'status', v_next_order_status,
    'note', case
      when v_recovering then format('Payment recovered after false failure via %s.', coalesce(p_source, 'verify'))
      else format('Payment verified via %s.', coalesce(p_source, 'verify'))
    end,
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
    case when coalesce(v_order.status, '') in ('pending_payment', 'cancelled') then 'paid' else null end,
    null,
    'succeeded',
    null,
    p_event_id
  );

  if coalesce(v_transition->>'ok', 'false') <> 'true' then
    raise exception 'Order transition failed: %', v_transition;
  end if;

  v_warehouse := coalesce(
    nullif(btrim(p_warehouse_code), ''),
    nullif(btrim(v_order.metadata->>'warehouse_code'), ''),
    'IN-WEST-01'
  );

  v_fulfill := public.fulfill_reserved_stock(p_order_id, null, v_warehouse);

  insert into public.activity_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    severity,
    metadata
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
      'recovered', v_recovering,
      'inventory', v_fulfill
    )
  );

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'recovered', v_recovering,
    'order_id', p_order_id,
    'payment_id', p_payment_id,
    'order_status', coalesce(v_transition->'row'->>'status', 'paid'),
    'inventory', v_fulfill
  );
end;
$$;

revoke all on function public.confirm_verified_payment(
  uuid, uuid, text, text, text, jsonb, text, text, text, text, timestamptz
) from public;
revoke all on function public.confirm_verified_payment(
  uuid, uuid, text, text, text, jsonb, text, text, text, text, timestamptz
) from anon;
revoke all on function public.confirm_verified_payment(
  uuid, uuid, text, text, text, jsonb, text, text, text, text, timestamptz
) from authenticated;
grant execute on function public.confirm_verified_payment(
  uuid, uuid, text, text, text, jsonb, text, text, text, text, timestamptz
) to service_role;
