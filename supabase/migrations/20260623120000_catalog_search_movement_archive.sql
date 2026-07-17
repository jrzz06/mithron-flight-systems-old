-- Catalog full-text search and inventory movement archival.

alter table public.mithron_products
  add column if not exists search_vector tsvector;

create or replace function public.mithron_products_refresh_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.slug, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.interests, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.source_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(new.source_catalog_id, '')), 'D');
  return new;
end;
$$;

drop trigger if exists mithron_products_search_vector_trg on public.mithron_products;
create trigger mithron_products_search_vector_trg
before insert or update of name, tagline, category, slug, interests, source_description, source_catalog_id
on public.mithron_products
for each row
execute function public.mithron_products_refresh_search_vector();

update public.mithron_products
set name = name
where search_vector is null;

create index if not exists mithron_products_search_vector_idx
  on public.mithron_products using gin (search_vector);

create or replace function public.search_published_products(
  p_query text,
  p_limit integer default 24
)
returns table (
  slug text,
  name text,
  tagline text,
  price numeric,
  badge text,
  category text,
  image jsonb,
  hero jsonb,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select nullif(btrim(p_query), '') as query
  ),
  ts_query as (
    select websearch_to_tsquery('english', normalized.query) as q
    from normalized
    where normalized.query is not null
  )
  select
    p.slug,
    p.name,
    coalesce(p.tagline, '') as tagline,
    p.price,
    p.badge,
    p.category,
    p.image,
    p.hero,
    ts_rank(p.search_vector, ts_query.q) as rank
  from public.mithron_products p
  cross join ts_query
  where p.workflow_status = 'published'
    and coalesce(p.is_visible, true) = true
    and p.category <> 'Imported Wix Inventory'
    and p.search_vector @@ ts_query.q
  order by rank desc, p.sort_order asc nulls last, p.slug asc
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

revoke all on function public.search_published_products(text, integer) from public;
grant execute on function public.search_published_products(text, integer) to anon, authenticated, service_role;

create table if not exists public.inventory_movements_archive (
  like public.inventory_movements including all
);

create index if not exists inventory_movements_archive_created_idx
  on public.inventory_movements_archive (created_at desc);

create index if not exists inventory_movements_archive_product_slug_idx
  on public.inventory_movements_archive (product_slug);

alter table public.inventory_movements_archive enable row level security;

drop policy if exists "inventory_movements_archive warehouse read" on public.inventory_movements_archive;
create policy "inventory_movements_archive warehouse read" on public.inventory_movements_archive
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "inventory_movements_archive service role manage" on public.inventory_movements_archive;
create policy "inventory_movements_archive service role manage" on public.inventory_movements_archive
for all to service_role
using (true)
with check (true);

create or replace function public.archive_inventory_movements(retention_days integer default 395)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 90));
  v_archived bigint := 0;
begin
  with moved as (
    delete from public.inventory_movements
    where created_at < v_cutoff
    returning *
  ),
  inserted as (
    insert into public.inventory_movements_archive
    select * from moved
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_archived from inserted;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'retention_days', greatest(retention_days, 90),
    'archived', v_archived
  );
end;
$$;

revoke all on function public.archive_inventory_movements(integer) from public;
revoke all on function public.archive_inventory_movements(integer) from anon;
revoke all on function public.archive_inventory_movements(integer) from authenticated;
grant execute on function public.archive_inventory_movements(integer) to service_role;

notify pgrst, 'reload schema';
