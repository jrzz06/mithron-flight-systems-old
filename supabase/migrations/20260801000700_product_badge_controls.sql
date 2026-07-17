alter table public.mithron_products
  add column if not exists badge_enabled boolean not null default false,
  add column if not exists badge_text text,
  add column if not exists badge_style text not null default 'default';

update public.mithron_products
set
  badge_text = nullif(btrim(badge), ''),
  badge_enabled = false,
  badge_style = coalesce(nullif(btrim(badge_style), ''), 'default')
where badge is not null
  and nullif(btrim(badge), '') is not null
  and (badge_text is null or nullif(btrim(badge_text), '') is null);

update public.mithron_products
set badge = null
where badge_enabled = false
   or nullif(btrim(badge_text), '') is null;

alter table public.mithron_products
  drop constraint if exists mithron_products_badge_style_check;

alter table public.mithron_products
  add constraint mithron_products_badge_style_check
  check (badge_style in ('default', 'success', 'warning', 'premium', 'sale'));

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
  order by rank desc, p.sort_order asc nulls last, p.slug asc
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

revoke all on function public.search_published_products(text, integer) from public;
grant execute on function public.search_published_products(text, integer) to anon, authenticated, service_role;
