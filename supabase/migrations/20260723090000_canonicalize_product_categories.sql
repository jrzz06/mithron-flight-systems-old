-- Canonicalize product + CMS category labels (case-insensitive dedupe).
-- Target storefront Title Case labels used by catalog taxonomy.

update public.mithron_products
set category = 'Agri Drones', updated_at = timezone('utc', now())
where lower(trim(category)) = 'agri drones'
  and category is distinct from 'Agri Drones';

update public.mithron_products
set category = 'Video Drones', updated_at = timezone('utc', now())
where lower(trim(category)) = 'video drones'
  and category is distinct from 'Video Drones';

update public.mithron_products
set category = 'Creative Drones', updated_at = timezone('utc', now())
where lower(trim(category)) = 'creative drones'
  and category is distinct from 'Creative Drones';

update public.mithron_products
set category = 'Survey Drones', updated_at = timezone('utc', now())
where lower(trim(category)) = 'survey drones'
  and category is distinct from 'Survey Drones';

update public.mithron_products
set category = 'Surveillance Drones', updated_at = timezone('utc', now())
where lower(trim(category)) = 'surveillance drones'
  and category is distinct from 'Surveillance Drones';

update public.mithron_products
set category = 'Accessories', updated_at = timezone('utc', now())
where lower(trim(category)) in ('accessories', 'all drones and spares', 'drone care')
  and category is distinct from 'Accessories';

update public.mithron_products
set category = 'Global Products', updated_at = timezone('utc', now())
where lower(trim(category)) in ('global products', 'global product')
  and category is distinct from 'Global Products';

-- Align category_metadata titles with the same canonical labels.
update public.category_metadata
set title = 'Agri Drones', updated_at = timezone('utc', now())
where route_key = 'agriculture'
  and title is distinct from 'Agri Drones';

update public.category_metadata
set title = 'Video Drones', updated_at = timezone('utc', now())
where route_key = 'videoDrones'
  and title is distinct from 'Video Drones';

update public.category_metadata
set title = 'Creative Drones', updated_at = timezone('utc', now())
where route_key = 'creativeDrones'
  and title is distinct from 'Creative Drones';

update public.category_metadata
set title = 'Survey Drones', updated_at = timezone('utc', now())
where route_key = 'mapping'
  and title is distinct from 'Survey Drones';

update public.category_metadata
set title = 'Accessories', updated_at = timezone('utc', now())
where route_key = 'accessories'
  and title is distinct from 'Accessories';

update public.category_metadata
set title = 'Global Products', updated_at = timezone('utc', now())
where route_key in ('global-products', 'industrial')
  and title is distinct from 'Global Products';

-- Ensure Surveillance exists in CMS category list when products use it.
insert into public.category_metadata (
  route_key,
  title,
  subtitle,
  hero_image,
  sort_order,
  is_visible,
  status,
  revision,
  created_at,
  updated_at
)
select
  'surveillance',
  'Surveillance Drones',
  'Surveillance Drones catalog category.',
  '',
  70,
  true,
  'published',
  1,
  timezone('utc', now()),
  timezone('utc', now())
where not exists (
  select 1 from public.category_metadata where route_key = 'surveillance'
);
