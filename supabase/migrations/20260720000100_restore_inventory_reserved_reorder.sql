-- Restore reserved_quantity + reorder_threshold on inventory writes.
-- Derives low_stock when sellable qty is at/below reorder threshold.

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
  v_sellable integer;
  v_reserved integer;
  v_reorder integer;
  v_existing_ws public.warehouse_stock%rowtype;
  v_committed integer;
begin
  if coalesce(trim(p_product_slug), '') = '' then
    raise exception 'product_slug is required';
  end if;
  if coalesce(trim(p_warehouse_code), '') = '' then
    raise exception 'warehouse_code is required';
  end if;
  if p_quantity < 0 or coalesce(p_reserved_quantity, 0) < 0 or coalesce(p_reorder_threshold, 0) < 0 then
    raise exception 'Quantities cannot be negative';
  end if;

  v_reserved := greatest(0, coalesce(p_reserved_quantity, 0));
  v_reorder := greatest(0, coalesce(p_reorder_threshold, 0));
  if v_reserved > p_quantity then
    raise exception 'Reserved quantity cannot exceed inventory quantity';
  end if;

  if not exists (select 1 from public.mithron_products p where p.slug = p_product_slug) then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_sku := coalesce(nullif(trim(p_sku), ''), public.derive_product_sku(p_product_slug));
  v_sellable := greatest(0, p_quantity - v_reserved);

  select * into v_existing_ws
  from public.warehouse_stock ws
  where ws.warehouse_code = p_warehouse_code
    and ws.product_slug = p_product_slug
    and ws.sku = v_sku
  for update;

  v_committed := least(
    greatest(0, coalesce(v_existing_ws.committed_quantity, 0)),
    v_sellable
  );

  if p_stock_status in ('available', 'low_stock', 'out_of_stock') then
    if p_stock_status = 'out_of_stock' and v_sellable > 0 then
      v_stock_status := case
        when v_reorder > 0 and v_sellable <= v_reorder then 'low_stock'
        else 'available'
      end;
    elsif p_stock_status = 'available' and v_sellable <= 0 then
      v_stock_status := 'out_of_stock';
    elsif p_stock_status = 'low_stock' and v_sellable <= 0 then
      v_stock_status := 'out_of_stock';
    else
      v_stock_status := p_stock_status;
    end if;
  elsif v_sellable <= 0 then
    v_stock_status := 'out_of_stock';
  elsif v_reorder > 0 and v_sellable <= v_reorder then
    v_stock_status := 'low_stock';
  else
    v_stock_status := 'available';
  end if;

  v_availability := case v_stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end;

  insert into public.inventory (
    product_slug, sku, variant_id, stock_status, quantity,
    reserved_quantity, reorder_threshold, updated_by, updated_at
  )
  values (
    p_product_slug, v_sku, p_variant_id, v_stock_status, p_quantity,
    v_reserved, v_reorder, p_updated_by, now()
  )
  on conflict (product_slug) do update set
    sku = excluded.sku,
    variant_id = coalesce(excluded.variant_id, inventory.variant_id),
    stock_status = excluded.stock_status,
    quantity = excluded.quantity,
    reserved_quantity = excluded.reserved_quantity,
    reorder_threshold = excluded.reorder_threshold,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.warehouse_stock (
    warehouse_code, product_slug, sku, variant_id,
    available_quantity, committed_quantity, updated_by, updated_at, last_counted_at
  )
  values (
    p_warehouse_code, p_product_slug, v_sku, p_variant_id,
    v_sellable, v_committed, p_updated_by, now(), now()
  )
  on conflict (warehouse_code, product_slug, sku) do update set
    variant_id = coalesce(excluded.variant_id, warehouse_stock.variant_id),
    available_quantity = excluded.available_quantity,
    committed_quantity = excluded.committed_quantity,
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
    'quantity', p_quantity,
    'reserved_quantity', v_reserved,
    'reorder_threshold', v_reorder,
    'stock_status', v_stock_status,
    'sellable', v_sellable
  );
end;
$$;

revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from public;
revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from anon;
revoke all on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) from authenticated;
grant execute on function public.upsert_product_inventory(text, text, text, integer, integer, integer, text, text, uuid) to service_role;

comment on function public.upsert_product_inventory is
  'Atomic inventory + warehouse_stock write. Honors reserved/reorder; derives low_stock from reorder threshold.';
