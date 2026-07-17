-- Reconcile warehouse_stock SKUs and quantities with canonical inventory rows (one row per product).

delete from public.warehouse_stock ws
using public.inventory i
where ws.product_slug = i.product_slug
  and ws.sku is distinct from i.sku;

insert into public.warehouse_stock (
  warehouse_code,
  product_slug,
  sku,
  available_quantity,
  committed_quantity,
  updated_at
)
select
  public.resolve_default_warehouse_code(),
  i.product_slug,
  i.sku,
  i.quantity,
  0,
  now()
from public.inventory i
on conflict (warehouse_code, product_slug, sku)
do update set
  available_quantity = excluded.available_quantity,
  updated_at = now();

update public.mithron_products p
set
  source_availability = case i.stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end,
  updated_at = now()
from public.inventory i
where i.product_slug = p.slug;
