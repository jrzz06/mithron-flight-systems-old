-- Additive performance RPCs for inventory parity and supplier nav metrics.
-- Paired JS callers keep REST fallbacks when RPCs are unavailable.

create or replace function public.get_inventory_parity_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with product_slugs as (
    select distinct nullif(btrim(slug), '') as slug
    from public.mithron_products
    where nullif(btrim(slug), '') is not null
  ),
  inventory_slug_counts as (
    select nullif(btrim(product_slug), '') as slug, count(*)::integer as slug_count
    from public.inventory
    where nullif(btrim(product_slug), '') is not null
    group by 1
  )
  select jsonb_build_object(
    'productCount', (select count(*)::integer from product_slugs),
    'inventoryCount', (select count(*)::integer from public.inventory),
    'missingInventory', (
      select count(*)::integer
      from product_slugs p
      where not exists (
        select 1 from inventory_slug_counts i where i.slug = p.slug
      )
    ),
    'duplicateInventorySlugs', (
      select count(*)::integer
      from inventory_slug_counts
      where slug_count > 1
    ),
    'orphanInventory', (
      select count(*)::integer
      from inventory_slug_counts i
      where not exists (
        select 1 from product_slugs p where p.slug = i.slug
      )
    )
  );
$$;

create or replace function public.get_supplier_inventory_alert_count(p_supplier_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.inventory i
  where i.stock_status in ('low_stock', 'out_of_stock')
    and exists (
      select 1
      from public.mithron_products p
      where p.supplier_id = p_supplier_id
        and nullif(btrim(p.slug), '') = nullif(btrim(i.product_slug), '')
    );
$$;

grant execute on function public.get_inventory_parity_counts() to service_role;
grant execute on function public.get_supplier_inventory_alert_count(uuid) to service_role;

-- Ensure stock metrics RPC remains callable by service role (idempotent grant).
grant execute on function public.get_inventory_stock_metrics() to service_role;
