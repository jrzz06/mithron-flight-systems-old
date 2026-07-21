-- Seed homepage CMS testimonial cards from published customer reviews when empty.
-- The storefront only renders Customer Testimonials from admin_settings homepage.v2.testimonialCards.

with ready as (
  select r.id,
         coalesce(nullif(trim(r.customer_name), ''), 'Customer') as author_name,
         r.product_slug,
         greatest(1, least(5, round(r.rating::numeric)::int)) as rating,
         left(trim(r.body), 200) as body,
         row_number() over (
           order by coalesce(r.pinned, false) desc,
                    coalesce(r.display_order, 9999) asc,
                    r.created_at desc
         ) - 1 as sort_order
  from public.customer_order_reviews r
  join public.mithron_products m on m.slug = r.product_slug
  where r.status = 'published'
    and coalesce(r.is_visible, true) = true
    and nullif(trim(r.body), '') is not null
    and nullif(trim(r.customer_name), '') is not null
    and coalesce(m.is_visible, true) = true
    and m.archived_at is null
    and nullif(m.image->>'src', '') is not null
  order by coalesce(r.pinned, false) desc,
           coalesce(r.display_order, 9999) asc,
           r.created_at desc
  limit 6
),
cards as (
  select jsonb_agg(
    jsonb_build_object(
      'id', 'testimonial-' || (sort_order + 1),
      'enabled', true,
      'authorName', author_name,
      'body', body,
      'rating', rating,
      'productSlug', product_slug,
      'hrefOverride', '',
      'avatarSrc', '',
      'avatarAlt', '',
      'sortOrder', sort_order
    )
    order by sort_order
  ) as testimonial_cards
  from ready
)
update public.admin_settings s
set payload = jsonb_set(
      jsonb_set(
        coalesce(s.payload, '{}'::jsonb),
        '{homepage,v2,testimonialCards}',
        coalesce((select testimonial_cards from cards), '[]'::jsonb),
        true
      ),
      '{homepage,v2,reviews}',
      coalesce(
        s.payload->'homepage'->'v2'->'reviews',
        '{}'::jsonb
      ) || jsonb_build_object('enabled', true, 'maxCount', 6, 'sortOrder', 'manual'),
      true
    ),
    updated_at = now()
where s.id = 'global'
  and coalesce(jsonb_array_length(s.payload->'homepage'->'v2'->'testimonialCards'), 0) = 0
  and exists (select 1 from cards where testimonial_cards is not null);

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
values ('testimonials', 130, true, 'published')
on conflict (section_key) do update set
  sort_order = excluded.sort_order,
  is_visible = true,
  status = excluded.status,
  updated_at = now();

insert into public.section_visibility (section_key, route_path, is_visible, status)
values ('testimonials', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = true,
  status = excluded.status;
