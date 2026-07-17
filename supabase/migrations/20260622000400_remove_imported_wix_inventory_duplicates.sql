-- Consolidate Imported Wix Inventory duplicates into canonical source-* catalog rows.

create or replace function public.normalize_catalog_name(input text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(coalesce(input, '')), '\s+', ' ', 'g'),
          '[|]', ' ', 'g'
        ),
        '–', '-', 'g'
      ),
      '&', 'and', 'g'
    )
  );
$$;

create or replace function public.infer_product_category(product_name text)
returns text
language sql
immutable
as $$
  select case
    when product_name ~* '(drone soccer|student drone|pluto|guru student|soccer drone)' then 'Creative Drones'
    when product_name ~* '(surveillance|safety security|thermal|monal)' then 'Surveillance Drones'
    when product_name ~* '(video|cinema|4k|gimbal|camera survey|decafly|siyi|skydroid c10|videography|multispectral)' then 'Video Drones'
    when product_name ~* '(agri|spray|spreader|kisan|liter|tc certified|seed|flybox|nozzle)' then 'Agri Drones'
    else 'Accessories'
  end;
$$;

create temp table wix_cleanup_map on commit drop as
select
  w.slug as wix_slug,
  coalesce(
    p_slug.slug,
    p_name.slug
  ) as target_slug
from public.mithron_products w
left join public.mithron_products p_slug
  on p_slug.slug = 'source-' || w.slug
  and p_slug.category <> 'Imported Wix Inventory'
left join lateral (
  select p.slug
  from public.mithron_products p
  where p.category <> 'Imported Wix Inventory'
    and public.normalize_catalog_name(p.name) = public.normalize_catalog_name(w.name)
  order by case when p.slug like 'source-%' then 0 else 1 end, p.slug
  limit 1
) p_name on true
where w.category = 'Imported Wix Inventory';

insert into public.mithron_products (
  slug,
  name,
  tagline,
  price,
  compare_at,
  badge,
  category,
  interests,
  image,
  hero,
  gallery,
  hotspots,
  variants,
  bundles,
  story,
  specs,
  anchors,
  product_url,
  sort_order,
  source_url,
  source_catalog_id,
  source_fingerprint,
  source_description,
  source_images,
  source_availability,
  source_currency,
  source_extracted_at,
  seo_title,
  seo_description,
  og_title,
  og_description,
  og_image,
  workflow_status,
  published_at,
  archived_at,
  is_visible,
  featured,
  global_available,
  supplier_id,
  submitted_by,
  rejection_reason,
  approved_at,
  approved_by,
  created_at,
  updated_at
)
select
  'source-' || w.slug,
  w.name,
  w.tagline,
  w.price,
  w.compare_at,
  w.badge,
  public.infer_product_category(w.name),
  w.interests,
  w.image,
  w.hero,
  w.gallery,
  w.hotspots,
  w.variants,
  w.bundles,
  w.story,
  w.specs,
  w.anchors,
  '/product/source-' || w.slug,
  w.sort_order,
  w.source_url,
  'mithron-source-' || w.slug,
  w.source_fingerprint,
  w.source_description,
  w.source_images,
  'uploaded_csv',
  w.source_currency,
  w.source_extracted_at,
  w.seo_title,
  w.seo_description,
  w.og_title,
  w.og_description,
  w.og_image,
  coalesce(w.workflow_status, 'published'),
  w.published_at,
  w.archived_at,
  coalesce(w.is_visible, true),
  w.featured,
  w.global_available,
  w.supplier_id,
  w.submitted_by,
  w.rejection_reason,
  w.approved_at,
  w.approved_by,
  w.created_at,
  timezone('utc', now())
from public.mithron_products w
where w.category = 'Imported Wix Inventory'
  and not exists (
    select 1
    from wix_cleanup_map m
    where m.wix_slug = w.slug
      and m.target_slug is not null
  )
  and not exists (
    select 1
    from public.mithron_products p
    where p.slug = 'source-' || w.slug
  );

delete from wix_cleanup_map;

insert into wix_cleanup_map (wix_slug, target_slug)
select
  w.slug as wix_slug,
  coalesce(
    p_slug.slug,
    p_name.slug,
    p_inserted.slug
  ) as target_slug
from public.mithron_products w
left join public.mithron_products p_slug
  on p_slug.slug = 'source-' || w.slug
  and p_slug.category <> 'Imported Wix Inventory'
left join lateral (
  select p.slug
  from public.mithron_products p
  where p.category <> 'Imported Wix Inventory'
    and public.normalize_catalog_name(p.name) = public.normalize_catalog_name(w.name)
  order by case when p.slug like 'source-%' then 0 else 1 end, p.slug
  limit 1
) p_name on true
left join public.mithron_products p_inserted
  on p_inserted.slug = 'source-' || w.slug
  and p_inserted.category <> 'Imported Wix Inventory'
where w.category = 'Imported Wix Inventory';

update public.mithron_products p
set
  price = case
    when coalesce(p.price, 0) = 0 and coalesce(w.price, 0) > 0 then w.price
    else p.price
  end,
  compare_at = coalesce(p.compare_at, w.compare_at),
  updated_at = timezone('utc', now())
from wix_cleanup_map m
join public.mithron_products w on w.slug = m.wix_slug
where p.slug = m.target_slug
  and m.target_slug is not null;

delete from public.product_media_assets pma_wix
using wix_cleanup_map m, public.product_media_assets pma_tgt
where pma_wix.product_slug = m.wix_slug
  and m.target_slug is not null
  and pma_tgt.product_slug = m.target_slug
  and pma_tgt.media_asset_id = pma_wix.media_asset_id
  and pma_tgt.usage = pma_wix.usage;

update public.product_media_assets pma
set
  product_slug = m.target_slug,
  updated_at = timezone('utc', now())
from wix_cleanup_map m
where pma.product_slug = m.wix_slug
  and m.target_slug is not null;

update public.warehouse_stock ws
set
  product_slug = m.target_slug,
  updated_at = timezone('utc', now())
from wix_cleanup_map m
where ws.product_slug = m.wix_slug
  and m.target_slug is not null;

update public.inventory_movements im
set
  product_id = m.target_slug
from wix_cleanup_map m
where im.product_id = m.wix_slug
  and m.target_slug is not null;

delete from public.mithron_products
where category = 'Imported Wix Inventory';

drop function if exists public.normalize_catalog_name(text);
drop function if exists public.infer_product_category(text);
