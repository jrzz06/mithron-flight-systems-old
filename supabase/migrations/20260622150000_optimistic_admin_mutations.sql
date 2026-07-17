-- Append-only order timeline, atomic product media primary, and inventory adjustment RPCs.

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

create or replace function public.set_product_media_primary(
  p_product_slug text,
  p_media_asset_id uuid,
  p_usage text default 'primary'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_product_slug is null or p_media_asset_id is null then
    raise exception 'product_slug and media_asset_id are required';
  end if;

  update public.product_media_assets
  set is_primary = false,
      updated_at = now()
  where product_slug = p_product_slug
    and usage = coalesce(p_usage, 'primary')
    and media_asset_id <> p_media_asset_id;

  insert into public.product_media_assets (
    product_slug,
    media_asset_id,
    usage,
    is_primary,
    sort_order,
    updated_at
  ) values (
    p_product_slug,
    p_media_asset_id,
    coalesce(p_usage, 'primary'),
    true,
    0,
    now()
  )
  on conflict (product_slug, media_asset_id, usage)
  do update set
    is_primary = true,
    sort_order = 0,
    updated_at = now();

  return jsonb_build_object('ok', true, 'product_slug', p_product_slug, 'media_asset_id', p_media_asset_id);
end;
$$;

revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from public;
revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from anon;
revoke all on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) from authenticated;
grant execute on function public.append_order_timeline_entry(uuid, jsonb, timestamptz) to service_role;

revoke all on function public.set_product_media_primary(text, uuid, text) from public;
revoke all on function public.set_product_media_primary(text, uuid, text) from anon;
revoke all on function public.set_product_media_primary(text, uuid, text) from authenticated;
grant execute on function public.set_product_media_primary(text, uuid, text) to service_role;
