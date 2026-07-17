-- Re-tag survey catalog rows and remove Imported Wix Inventory CSV duplicate rows.

update public.mithron_products
set
  category = 'Survey Drones',
  updated_at = timezone('utc', now())
where slug in (
  'source-pix4d-field-software',
  'source-pix4d-mapper-software',
  'source-pix4d-matic-software',
  'source-pix4d-survey-software',
  'source-gnss-module',
  'source-gnss-receiver-rs2-with-tripod-and-tribrach',
  'source-multispectral-camera-survey-drone',
  'source-24mp-camera-survey-drone',
  'source-10x-seeker-optical-zoom-cmera-survey-drone'
);

create temp table import_dupe_cleanup on commit drop as
select *
from (
  values
    ('source-agri-kisan-drone-variants-small', 'source-agri-kisan-drone-small-8-liter'),
    ('source-agri-kisan-drone-variants-small-8l', 'source-agri-kisan-drone-small-8-liter'),
    ('source-agri-kisan-drone-variants-medium', 'source-agri-kisan-drone-medium-10-liter'),
    ('source-agri-kisan-drone-variants-medium-10l', 'source-agri-kisan-drone-medium-10-liter'),
    ('source-16l-type-certified-agri-drone-add-on-with-spreader', 'source-16l-type-certified-agri-drone'),
    ('source-16l-type-certified-agri-drone-variants-with-spreader', 'source-16l-type-certified-agri-drone'),
    ('source-16l-type-certified-agri-drone-variants-without-spreader', 'source-16l-type-certified-agri-drone'),
    ('source-hobbywing-2480-propellers-with-mount-cw', 'source-hobbywing-2480-propellers-with-mount-ccw')
) as mapping(wix_slug, canonical_slug)
where exists (
  select 1
  from public.mithron_products w
  where w.slug = mapping.wix_slug
    and w.category = 'Imported Wix Inventory'
)
and exists (
  select 1
  from public.mithron_products c
  where c.slug = mapping.canonical_slug
    and c.category <> 'Imported Wix Inventory'
);

delete from public.product_media_assets pma_wix
using import_dupe_cleanup m, public.product_media_assets pma_tgt
where pma_wix.product_slug = m.wix_slug
  and pma_tgt.product_slug = m.canonical_slug
  and pma_tgt.media_asset_id = pma_wix.media_asset_id
  and pma_tgt.usage = pma_wix.usage;

update public.product_media_assets pma
set
  product_slug = m.canonical_slug,
  updated_at = timezone('utc', now())
from import_dupe_cleanup m
where pma.product_slug = m.wix_slug;

update public.warehouse_stock ws
set
  product_slug = m.canonical_slug,
  updated_at = timezone('utc', now())
from import_dupe_cleanup m
where ws.product_slug = m.wix_slug;

update public.inventory_movements im
set
  product_id = m.canonical_slug
from import_dupe_cleanup m
where im.product_id = m.wix_slug;

delete from public.mithron_products w
using import_dupe_cleanup m
where w.slug = m.wix_slug;
