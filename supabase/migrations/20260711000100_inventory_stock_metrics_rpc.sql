-- Consolidate inventory stock metric counts into one RPC for control panel inventory pages.

create or replace function public.get_inventory_stock_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totalInventoryItems', (select count(*)::integer from public.inventory),
    'inStock', (select count(*)::integer from public.inventory where stock_status = 'available' and quantity > 0),
    'lowStock', (select count(*)::integer from public.inventory where stock_status = 'low_stock'),
    'outOfStock', greatest(
      (select count(*)::integer from public.inventory where stock_status = 'out_of_stock'),
      (select count(*)::integer from public.inventory where quantity = 0)
    )
  );
$$;
