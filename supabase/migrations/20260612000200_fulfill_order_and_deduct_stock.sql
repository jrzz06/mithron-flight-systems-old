-- Atomic fulfillment status update with stock deduction helper.
create or replace function public.fulfill_order_and_deduct_stock(
  p_order_id uuid,
  p_fulfillment_status text,
  p_warehouse_code text default 'IN-WEST-01'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_stock public.warehouse_stock%rowtype;
  v_deducted integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  update public.orders
  set fulfillment_status = p_fulfillment_status,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if p_fulfillment_status in ('packed', 'shipped', 'delivered') then
    for v_item in
      select product_slug, quantity
      from public.order_items
      where order_id = p_order_id
    loop
      select * into v_stock
      from public.warehouse_stock
      where product_slug = v_item.product_slug
        and warehouse_code = p_warehouse_code
      order by available_quantity desc
      limit 1
      for update;

      if found and coalesce(v_stock.available_quantity, 0) >= v_item.quantity then
        update public.warehouse_stock
        set available_quantity = available_quantity - v_item.quantity,
            committed_quantity = greatest(0, coalesce(committed_quantity, 0) - v_item.quantity),
            updated_at = now()
        where id = v_stock.id;
        v_deducted := v_deducted + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'fulfillment_status', v_order.fulfillment_status,
    'stock_rows_updated', v_deducted
  );
end;
$$;

grant execute on function public.fulfill_order_and_deduct_stock(uuid, text, text) to service_role;
