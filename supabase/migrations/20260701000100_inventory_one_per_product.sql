-- Enforce exactly one inventory row per product (1:1 product → catalog inventory).
-- Merges duplicate rows, backfills missing rows, removes orphans, and records a reconcile report.

create table if not exists public.inventory_reconcile_reports (
  id uuid primary key default gen_random_uuid(),
  duplicates_merged integer not null default 0,
  missing_created integer not null default 0,
  orphans_removed integer not null default 0,
  sku_normalized integer not null default 0,
  final_product_count integer not null default 0,
  final_inventory_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.inventory_reconcile_reports enable row level security;

drop policy if exists "inventory_reconcile_reports service role manage" on public.inventory_reconcile_reports;
create policy "inventory_reconcile_reports service role manage" on public.inventory_reconcile_reports
for all to service_role
using (true)
with check (true);

drop policy if exists "inventory_reconcile_reports admin read" on public.inventory_reconcile_reports;
create policy "inventory_reconcile_reports admin read" on public.inventory_reconcile_reports
for select to authenticated
using (public.has_cms_permission('audit.read') or public.has_cms_permission('inventory.write'));

create or replace function public.enforce_canonical_inventory_sku()
returns trigger
language plpgsql
as $$
begin
  new.sku := public.derive_product_sku(new.product_slug);
  return new;
end;
$$;

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

  if exists (select 1 from public.inventory i where i.product_slug = v_slug) then
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
  );
end;
$$;

create or replace function public.reconcile_product_inventory_integrity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duplicates_merged integer := 0;
  v_missing_created integer := 0;
  v_orphans_removed integer := 0;
  v_sku_normalized integer := 0;
  v_final_product_count integer := 0;
  v_final_inventory_count integer := 0;
  v_dup record;
  v_canonical_id uuid;
  v_canonical_sku text;
  v_total_qty integer;
  v_total_reserved integer;
  v_max_reorder integer;
  v_best_status text;
  v_dup_ids uuid[];
  v_details jsonb := '[]'::jsonb;
begin
  -- Merge duplicate inventory rows per product_slug.
  for v_dup in
    select i.product_slug, count(*)::integer as row_count
    from public.inventory i
    group by i.product_slug
    having count(*) > 1
  loop
    v_canonical_sku := public.derive_product_sku(v_dup.product_slug);

    select i.id
    into v_canonical_id
    from public.inventory i
    where i.product_slug = v_dup.product_slug
      and i.sku = v_canonical_sku
    limit 1;

    if v_canonical_id is null then
      select i.id
      into v_canonical_id
      from public.inventory i
      where i.product_slug = v_dup.product_slug
      order by i.quantity desc, i.updated_at desc nulls last, i.created_at desc
      limit 1;
    end if;

    select
      coalesce(sum(i.quantity), 0),
      coalesce(sum(i.reserved_quantity), 0),
      coalesce(max(i.reorder_threshold), 0)
    into v_total_qty, v_total_reserved, v_max_reorder
    from public.inventory i
    where i.product_slug = v_dup.product_slug;

    select i.stock_status
    into v_best_status
    from public.inventory i
    where i.product_slug = v_dup.product_slug
    order by
      case i.stock_status
        when 'available' then 1
        when 'low_stock' then 2
        when 'reserved' then 3
        when 'out_of_stock' then 4
        else 5
      end,
      i.quantity desc
    limit 1;

    select array_agg(i.id)
    into v_dup_ids
    from public.inventory i
    where i.product_slug = v_dup.product_slug
      and i.id <> v_canonical_id;

    update public.inventory_movements im
    set sku = v_canonical_sku
    where im.product_slug = v_dup.product_slug
      and im.sku <> v_canonical_sku;

    update public.warehouse_stock ws
    set sku = v_canonical_sku
    where ws.product_slug = v_dup.product_slug
      and ws.sku <> v_canonical_sku;

    update public.inventory
    set
      sku = v_canonical_sku,
      quantity = v_total_qty,
      reserved_quantity = v_total_reserved,
      reorder_threshold = v_max_reorder,
      stock_status = coalesce(v_best_status, 'out_of_stock'),
      updated_at = now()
    where id = v_canonical_id;

    delete from public.inventory
    where id = any(v_dup_ids);

    v_duplicates_merged := v_duplicates_merged + coalesce(array_length(v_dup_ids, 1), 0);
    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'product_slug', v_dup.product_slug,
        'merged_rows', coalesce(array_length(v_dup_ids, 1), 0),
        'canonical_sku', v_canonical_sku
      )
    );
  end loop;

  -- Backfill products missing inventory.
  for v_dup in
    select p.slug
    from public.mithron_products p
    where not exists (
      select 1 from public.inventory i where i.product_slug = p.slug
    )
  loop
    perform public.ensure_product_catalog_inventory_row(v_dup.slug);
    v_missing_created := v_missing_created + 1;
  end loop;

  -- Remove orphan inventory rows.
  with deleted as (
    delete from public.inventory i
    where not exists (
      select 1 from public.mithron_products p where p.slug = i.product_slug
    )
    returning i.id
  )
  select count(*)::integer into v_orphans_removed from deleted;

  -- Normalize surviving SKUs to canonical derived values.
  with normalized as (
    update public.inventory i
    set sku = public.derive_product_sku(i.product_slug),
        updated_at = now()
    where i.sku <> public.derive_product_sku(i.product_slug)
    returning i.id
  )
  select count(*)::integer into v_sku_normalized from normalized;

  select count(*)::integer into v_final_product_count from public.mithron_products;
  select count(*)::integer into v_final_inventory_count from public.inventory;

  insert into public.inventory_reconcile_reports (
    duplicates_merged,
    missing_created,
    orphans_removed,
    sku_normalized,
    final_product_count,
    final_inventory_count,
    details
  )
  values (
    v_duplicates_merged,
    v_missing_created,
    v_orphans_removed,
    v_sku_normalized,
    v_final_product_count,
    v_final_inventory_count,
    jsonb_build_object('merged_products', v_details)
  );

  return jsonb_build_object(
    'duplicates_merged', v_duplicates_merged,
    'missing_created', v_missing_created,
    'orphans_removed', v_orphans_removed,
    'sku_normalized', v_sku_normalized,
    'final_product_count', v_final_product_count,
    'final_inventory_count', v_final_inventory_count
  );
end;
$$;

-- Run reconciliation before adding the unique constraint.
select public.reconcile_product_inventory_integrity();

-- Drop composite unique and enforce one row per product.
alter table public.inventory drop constraint if exists inventory_product_slug_sku_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_one_per_product'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_one_per_product unique (product_slug);
  end if;
end $$;

drop trigger if exists trg_inventory_canonical_sku on public.inventory;
create trigger trg_inventory_canonical_sku
before insert or update of product_slug, sku on public.inventory
for each row
execute function public.enforce_canonical_inventory_sku();

-- Upsert-safe ensure function (requires inventory_one_per_product constraint).
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
  on conflict (product_slug) do nothing;
end;
$$;
