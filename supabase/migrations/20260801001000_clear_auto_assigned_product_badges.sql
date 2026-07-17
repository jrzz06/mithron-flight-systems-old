-- Clear all auto-imported and legacy ribbon values.
-- Ribbons are now 100% manual: only non-empty badge_text set by admin should display.
update public.mithron_products
set
  badge = null,
  badge_enabled = false,
  badge_text = null,
  badge_style = 'default';

-- Keep badge_enabled and legacy badge column in sync with badge_text.
create or replace function public.sync_product_badge_enabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.badge_enabled := nullif(btrim(coalesce(new.badge_text, '')), '') is not null;
  new.badge := case
    when nullif(btrim(coalesce(new.badge_text, '')), '') is not null then nullif(btrim(new.badge_text), '')
    else null
  end;
  return new;
end;
$$;

drop trigger if exists sync_product_badge_enabled on public.mithron_products;

create trigger sync_product_badge_enabled
before insert or update of badge_text, badge_style, badge_enabled, badge
on public.mithron_products
for each row
execute function public.sync_product_badge_enabled();

-- Search index: only index explicit badge_text (ignore legacy badge column).
create or replace function public.mithron_products_refresh_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  specs_text text;
begin
  specs_text := coalesce(
    (
      select string_agg(value, ' ')
      from jsonb_each_text(coalesce(new.specs, '{}'::jsonb))
    ),
    ''
  );

  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.slug, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.interests, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.anchors, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.badge_text, '')), 'C') ||
    setweight(to_tsvector('english', specs_text), 'D') ||
    setweight(to_tsvector('english', coalesce(new.source_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(new.source_catalog_id, '')), 'D');
  return new;
end;
$$;

-- Storefront search RPC: badge only when badge_text is explicitly set.
drop function if exists public.search_published_products(text, integer);

create function public.search_published_products(
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
  bounded as (
    select greatest(1, least(coalesce(p_limit, 24), 100)) as lim
  ),
  ts_query as (
    select websearch_to_tsquery('english', normalized.query) as q
    from normalized
    where normalized.query is not null
  ),
  fts_results as (
    select
      p.slug,
      p.name,
      coalesce(p.tagline, '') as tagline,
      p.price,
      nullif(btrim(p.badge_text), '') as badge,
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
  ),
  ilike_results as (
    select
      p.slug,
      p.name,
      coalesce(p.tagline, '') as tagline,
      p.price,
      nullif(btrim(p.badge_text), '') as badge,
      p.category,
      p.image,
      p.hero,
      0.15::real as rank
    from public.mithron_products p
    cross join normalized
    cross join bounded
    where normalized.query is not null
      and p.workflow_status = 'published'
      and coalesce(p.is_visible, true) = true
      and p.category <> 'Imported Wix Inventory'
      and (
        p.name ilike '%' || normalized.query || '%'
        or coalesce(p.tagline, '') ilike '%' || normalized.query || '%'
        or p.slug ilike '%' || normalized.query || '%'
        or p.category ilike '%' || normalized.query || '%'
        or coalesce(p.description, '') ilike '%' || normalized.query || '%'
        or coalesce(p.source_description, '') ilike '%' || normalized.query || '%'
        or coalesce(p.badge_text, '') ilike '%' || normalized.query || '%'
        or coalesce(p.source_catalog_id, '') ilike '%' || normalized.query || '%'
        or coalesce(array_to_string(p.interests, ' '), '') ilike '%' || normalized.query || '%'
        or coalesce(array_to_string(p.anchors, ' '), '') ilike '%' || normalized.query || '%'
      )
      and not exists (select 1 from fts_results)
  ),
  combined as (
    select * from fts_results
    union all
    select * from ilike_results
  )
  select
    c.slug,
    c.name,
    c.tagline,
    c.price,
    c.badge,
    c.category,
    c.image,
    c.hero,
    c.rank
  from combined c
  order by c.rank desc, c.name asc
  limit (select lim from bounded);
$$;

revoke all on function public.search_published_products(text, integer) from public;
grant execute on function public.search_published_products(text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
