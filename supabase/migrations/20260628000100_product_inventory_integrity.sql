-- Enforce 1:1 product → canonical inventory row at the database layer.

create or replace function public.derive_product_sku(slug text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        upper(regexp_replace(trim(coalesce(slug, '')), '[^A-Za-z0-9]+', '-', 'g')),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'SKU'
  );
$$;

create or replace function public.resolve_default_warehouse_code()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select wc.default_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    (
      select w.code
      from public.warehouses w
      where w.is_active = true
      order by w.code asc
      limit 1
    ),
    'IN-WEST-01'
  );
$$;

create or replace function public.ensure_product_inventory_row(p_slug text)
returns void
language plpgsql
as $$
declare
  v_slug text := trim(coalesce(p_slug, ''));
  v_sku text;
  v_warehouse text;
begin
  if v_slug = '' then
    return;
  end if;

  v_sku := public.derive_product_sku(v_slug);
  v_warehouse := public.resolve_default_warehouse_code();

  insert into public.inventory (
    product_slug,
    sku,
    stock_status,
    quantity,
    reserved_quantity,
    reorder_threshold,
    updated_at
  )
  values (
    v_slug,
    v_sku,
    'out_of_stock',
    0,
    0,
    0,
    now()
  )
  on conflict (product_slug, sku) do nothing;

  insert into public.warehouse_stock (
    warehouse_code,
    product_slug,
    sku,
    available_quantity,
    committed_quantity,
    updated_at
  )
  values (
    v_warehouse,
    v_slug,
    v_sku,
    0,
    0,
    now()
  )
  on conflict (warehouse_code, product_slug, sku) do nothing;
end;
$$;

-- Backfill every product missing a canonical inventory row.
do $$
declare
  product_row record;
begin
  for product_row in
    select p.slug
    from public.mithron_products p
    where not exists (
      select 1
      from public.inventory i
      where i.product_slug = p.slug
        and i.sku = public.derive_product_sku(p.slug)
    )
  loop
    perform public.ensure_product_inventory_row(product_row.slug);
  end loop;
end;
$$;

drop trigger if exists trg_mithron_products_ensure_inventory on public.mithron_products;

create or replace function public.trg_mithron_products_ensure_inventory_fn()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_product_inventory_row(new.slug);
  return new;
end;
$$;

create trigger trg_mithron_products_ensure_inventory
after insert on public.mithron_products
for each row
execute function public.trg_mithron_products_ensure_inventory_fn();
