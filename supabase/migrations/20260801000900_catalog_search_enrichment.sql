-- Enrich catalog full-text search with description, brand badge, specs, and anchors.

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
    setweight(to_tsvector('english', coalesce(new.badge_text, new.badge, '')), 'C') ||
    setweight(to_tsvector('english', specs_text), 'D') ||
    setweight(to_tsvector('english', coalesce(new.source_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(new.source_catalog_id, '')), 'D');
  return new;
end;
$$;

drop trigger if exists mithron_products_search_vector_trg on public.mithron_products;
create trigger mithron_products_search_vector_trg
before insert or update of
  name,
  tagline,
  category,
  slug,
  interests,
  anchors,
  description,
  specs,
  badge,
  badge_text,
  source_description,
  source_catalog_id
on public.mithron_products
for each row
execute function public.mithron_products_refresh_search_vector();

update public.mithron_products
set name = name
where search_vector is null;

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
      case
        when p.badge_enabled and nullif(btrim(p.badge_text), '') is not null
          then nullif(btrim(p.badge_text), '')
        else null
      end as badge,
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
      case
        when p.badge_enabled and nullif(btrim(p.badge_text), '') is not null
          then nullif(btrim(p.badge_text), '')
        else null
      end as badge,
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
        or coalesce(p.badge_text, p.badge, '') ilike '%' || normalized.query || '%'
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
