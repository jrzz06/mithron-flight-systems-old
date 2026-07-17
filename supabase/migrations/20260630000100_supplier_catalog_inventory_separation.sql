-- Separate supplier catalog inventory seeding from warehouse stock initialization.
-- Product creation only seeds public.inventory; warehouse_stock is reserved for fulfillment workflows.

create or replace function public.ensure_product_catalog_inventory_row(p_slug text)
returns void
language plpgsql
as $$
declare
  v_slug text := trim(coalesce(p_slug, ''));
  v_sku text;
begin
  if v_slug = '' then
    return;
  end if;

  v_sku := public.derive_product_sku(v_slug);

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
end;
$$;

create or replace function public.ensure_warehouse_stock_row(p_slug text, p_warehouse_code text default null)
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
  v_warehouse := coalesce(nullif(trim(coalesce(p_warehouse_code, '')), ''), public.resolve_default_warehouse_code());

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

-- Backward-compatible wrapper for admin repair tools that need both rows.
create or replace function public.ensure_product_inventory_row(p_slug text)
returns void
language plpgsql
as $$
begin
  perform public.ensure_product_catalog_inventory_row(p_slug);
  perform public.ensure_warehouse_stock_row(p_slug, null);
end;
$$;

create or replace function public.trg_mithron_products_ensure_inventory_fn()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_product_catalog_inventory_row(new.slug);
  return new;
end;
$$;

-- Supplier catalog inventory: allow products.submit and inventory.update_own for owned products.
drop policy if exists "inventory supplier catalog write" on public.inventory;
create policy "inventory supplier catalog write" on public.inventory
for insert to authenticated
with check (
  public.has_cms_permission('products.submit')
  or public.has_cms_permission('inventory.update_own')
);

-- Seed inventory.update_own for supplier role.
insert into public.permissions (key, label, description)
values ('inventory.update_own', 'Update Own Inventory', 'Seed and update catalog inventory for supplier-owned products.')
on conflict (key) do update
set label = excluded.label,
    description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
values ('supplier', 'inventory.update_own')
on conflict (role_key, permission_key) do nothing;
