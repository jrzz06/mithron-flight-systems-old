do $$
begin
  create type public.cms_publish_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  default_role text not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  key text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  key text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.roles(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

create table if not exists public.role_permissions (
  role_key text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.has_cms_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.role_key = required_role
        or ur.role_key = 'super_admin'
      )
  );
$$;

create or replace function public.has_cms_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and (
        rp.permission_key = required_permission
        or ur.role_key = 'super_admin'
      )
  );
$$;

create table if not exists public.hero_banners (
  id text primary key,
  product_slug text,
  title text not null,
  subtitle text not null,
  cta_label text not null,
  href text not null,
  image jsonb not null,
  poster jsonb,
  video jsonb,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  composition jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  starts_at timestamptz,
  ends_at timestamptz,
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_sections (
  id text primary key,
  section_key text not null unique,
  label text not null,
  component_key text not null,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.section_visibility (
  id uuid primary key default gen_random_uuid(),
  section_key text not null references public.homepage_sections(section_key) on delete cascade,
  route_path text not null default '/',
  is_visible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.cms_publish_status not null default 'published',
  created_at timestamptz not null default now(),
  unique (section_key, route_path)
);

create table if not exists public.site_navigation (
  id text primary key,
  label text not null,
  href text not null,
  placement text not null default 'primary',
  parent_id text references public.site_navigation(id) on delete cascade,
  required_role text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.footer_columns (
  id text primary key,
  title text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.footer_links (
  id text primary key,
  column_id text not null references public.footer_columns(id) on delete cascade,
  label text not null,
  href text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_metadata (
  route_key text primary key,
  title text not null,
  subtitle text not null,
  hero_image text not null,
  showcase_image jsonb,
  personality text,
  featured_product_slugs text[] not null default '{}',
  ecosystem_payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trust_cards (
  id text primary key,
  icon text not null,
  title text not null,
  body text not null,
  image_src text not null,
  image_alt text not null,
  image_class_name text not null,
  class_name text not null,
  image_stage_class_name text,
  is_feature boolean not null default false,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ecosystem_cards (
  id text primary key,
  title text not null,
  body text not null,
  media_asset_id text,
  href text,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployment_locations (
  id text primary key,
  title text not null,
  country text not null,
  city text not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  category text not null,
  deployment_status text not null default 'standby',
  marker_color text,
  image text,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id text primary key,
  name text not null,
  role text,
  company text,
  body text not null,
  rating numeric(2, 1),
  media_asset_id text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_reviews (
  id text primary key,
  product_slug text,
  reviewer_name text not null,
  body text not null,
  rating numeric(2, 1),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id text primary key,
  scope text not null default 'global',
  product_slug text,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id text primary key,
  bucket text not null,
  storage_path text not null,
  public_url text not null,
  alt text,
  folder text not null default 'general',
  tags text[] not null default '{}',
  mime_type text not null,
  width integer,
  height integer,
  size_bytes bigint,
  content_hash text,
  variants jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_primary boolean not null default false,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create table if not exists public.homepage_ordering (
  section_key text primary key references public.homepage_sections(section_key) on delete cascade,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  updated_at timestamptz not null default now()
);

create table if not exists public.promotional_campaigns (
  id text primary key,
  label text not null,
  headline text not null,
  body text,
  cta_label text,
  href text,
  media_asset_id text references public.media_assets(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'draft',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  sku text,
  stock_status text not null default 'available',
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  reorder_threshold integer not null default 0 check (reorder_threshold >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_slug, sku)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_email text,
  status text not null default 'draft',
  channel text not null default 'deployment_request',
  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null,
  product_slug text not null,
  sku text,
  available_quantity integer not null default 0 check (available_quantity >= 0),
  committed_quantity integer not null default 0 check (committed_quantity >= 0),
  last_counted_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_code, product_slug, sku)
);

create table if not exists public.deployment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  requester_email text,
  region text,
  mission_profile text,
  status text not null default 'new',
  notes text,
  payload jsonb not null default '{}'::jsonb,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to uuid references auth.users(id) on delete set null,
  related_request_id uuid references public.deployment_requests(id) on delete set null,
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.hero_banners enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.section_visibility enable row level security;
alter table public.site_navigation enable row level security;
alter table public.footer_columns enable row level security;
alter table public.footer_links enable row level security;
alter table public.category_metadata enable row level security;
alter table public.trust_cards enable row level security;
alter table public.ecosystem_cards enable row level security;
alter table public.deployment_locations enable row level security;
alter table public.testimonials enable row level security;
alter table public.product_reviews enable row level security;
alter table public.faqs enable row level security;
alter table public.media_assets enable row level security;
alter table public.homepage_ordering enable row level security;
alter table public.promotional_campaigns enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.warehouse_stock enable row level security;
alter table public.deployment_requests enable row level security;
alter table public.staff_tasks enable row level security;

create index if not exists hero_banners_publish_idx on public.hero_banners (status, is_visible, sort_order);
create index if not exists media_assets_lookup_idx on public.media_assets (bucket, folder, status, is_visible);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists site_navigation_publish_idx on public.site_navigation (placement, status, is_visible, sort_order);
create index if not exists category_metadata_publish_idx on public.category_metadata (status, is_visible, sort_order);
create index if not exists trust_cards_publish_idx on public.trust_cards (status, is_visible, sort_order);
create index if not exists product_reviews_product_idx on public.product_reviews (product_slug, status, is_visible, sort_order);
create index if not exists faqs_scope_idx on public.faqs (scope, product_slug, status, is_visible, sort_order);
create index if not exists inventory_product_idx on public.inventory (product_slug, stock_status);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists warehouse_stock_lookup_idx on public.warehouse_stock (warehouse_code, product_slug);
create index if not exists deployment_requests_status_idx on public.deployment_requests (status, created_at desc);
create index if not exists staff_tasks_assignee_idx on public.staff_tasks (assigned_to, status, due_at);

insert into public.roles (key, label, description, sort_order) values
  ('super_admin', 'Super Admin', 'Complete website, CMS, product, media, warehouse, operations, and settings control.', 1),
  ('admin', 'Admin', 'CMS, product, media, campaign, and operational editorial control.', 2),
  ('warehouse_manager', 'Warehouse Manager', 'Inventory, stock, fulfillment, order, and logistics control.', 3),
  ('staff', 'Staff', 'Assigned task and limited deployment workflow access.', 4)
on conflict (key) do update set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

insert into public.permissions (key, label, description) values
  ('cms.read', 'Read CMS', 'View published and draft CMS content.'),
  ('cms.write', 'Write CMS', 'Create and update CMS content.'),
  ('products.write', 'Write Products', 'Create and update product catalog data.'),
  ('media.write', 'Write Media', 'Upload and manage media assets.'),
  ('warehouse.write', 'Write Warehouse', 'Manage inventory and stock operations.'),
  ('orders.write', 'Write Orders', 'Manage order and fulfillment state.'),
  ('operations.write', 'Write Operations', 'Manage operational deployment workflows.'),
  ('settings.write', 'Write Settings', 'Manage global platform settings.'),
  ('audit.read', 'Read Audit', 'View activity history and audit logs.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key
from (
  values
    ('super_admin', 'cms.read'), ('super_admin', 'cms.write'), ('super_admin', 'products.write'), ('super_admin', 'media.write'), ('super_admin', 'warehouse.write'), ('super_admin', 'orders.write'), ('super_admin', 'operations.write'), ('super_admin', 'settings.write'), ('super_admin', 'audit.read'),
    ('admin', 'cms.read'), ('admin', 'cms.write'), ('admin', 'products.write'), ('admin', 'media.write'), ('admin', 'operations.write'), ('admin', 'audit.read'),
    ('warehouse_manager', 'warehouse.write'), ('warehouse_manager', 'orders.write'),
    ('staff', 'operations.write')
) as grants(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;

insert into public.hero_banners (id, product_slug, title, subtitle, cta_label, href, image, poster, theme, composition, sort_order, is_visible, status) values
  ('ag10-arrival', 'source-agri-kisan-drone-small-8-liter', 'Mithron Precision Agriculture', 'Spraying intelligence for farms, orchards, and high-value crop corridors with field-ready autonomous coverage.', 'Plan deployment', '/product/source-agri-kisan-drone-small-8-liter', '{"src":"/assets/hero/hero-slide-01.webp","alt":"Mithron agriculture drone spraying over a golden crop valley","width":1448,"height":1086,"local":true,"priority":true}'::jsonb, '{"src":"/assets/hero/hero-slide-01.webp","alt":"Mithron agriculture drone spraying over a golden crop valley","width":1448,"height":1086,"local":true,"priority":true}'::jsonb, 'light', '{"mode":"full-bleed","textTone":"dark","mediaPosition":"59% 50%","mobileMediaPosition":"56% 42%","productDominance":"flagship"}'::jsonb, 10, true, 'published'),
  ('mapping-flight', 'source-10x-seeker-optical-zoom-cmera-survey-drone', 'Mithron Terrain Mapping', 'Long-range aerial survey context for terrain intelligence, route planning, and infrastructure-ready field teams.', 'View survey platform', '/product/source-10x-seeker-optical-zoom-cmera-survey-drone', '{"src":"/assets/hero/hero-slide-02.webp","alt":"Mithron survey drone crossing a mountain valley at sunset","width":1448,"height":1086,"local":true}'::jsonb, '{"src":"/assets/hero/hero-slide-02.webp","alt":"Mithron survey drone crossing a mountain valley at sunset","width":1448,"height":1086,"local":true}'::jsonb, 'light', '{"mode":"full-bleed","textTone":"dark","mediaPosition":"62% 28%","mobileMediaPosition":"68% 20%","productDominance":"flagship"}'::jsonb, 20, true, 'published'),
  ('drone-ecosystem', 'source-v9-flight-controller-for-agriculture-drones', 'Mithron Drone Ecosystem', 'Airframes, payloads, controllers, batteries, and service parts organized for full-stack drone operations.', 'Explore ecosystem', '/accessories', '{"src":"/assets/hero/hero-slide-03.webp","alt":"Mithron modular drone ecosystem with airframe and payload components","width":1672,"height":941,"local":true}'::jsonb, '{"src":"/assets/hero/hero-slide-03.webp","alt":"Mithron modular drone ecosystem with airframe and payload components","width":1672,"height":941,"local":true}'::jsonb, 'light', '{}'::jsonb, 30, true, 'published'),
  ('surveillance-grid', 'source-10l-drone-with-safety-security', 'Mithron Night Surveillance', 'Low-light aerial awareness for perimeter monitoring, rapid response, and critical site security.', 'Explore systems', '/product/source-10l-drone-with-safety-security', '{"src":"/assets/hero/hero-slide-04.webp","alt":"Mithron surveillance drone flying through a neon city at night","width":1672,"height":941,"local":true}'::jsonb, '{"src":"/assets/hero/hero-slide-04.webp","alt":"Mithron surveillance drone flying through a neon city at night","width":1672,"height":941,"local":true}'::jsonb, 'dark', '{}'::jsonb, 40, true, 'published')
on conflict (id) do update set title = excluded.title, subtitle = excluded.subtitle, cta_label = excluded.cta_label, href = excluded.href, image = excluded.image, poster = excluded.poster, theme = excluded.theme, composition = excluded.composition, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.homepage_sections (id, section_key, label, component_key, sort_order, is_visible, status) values
  ('home-hero', 'hero', 'Hero carousel', 'HeroCarousel', 10, true, 'published'),
  ('home-product-icon-rail', 'product-icon-rail', 'Product shortcuts', 'ProductIconRail', 20, true, 'published'),
  ('home-interests', 'interests', 'Interest rail', 'InterestSection', 30, true, 'published'),
  ('home-trust', 'trust', 'Operational ecosystem', 'TrustSection', 40, true, 'published'),
  ('home-cinematic-media-rail', 'cinematic-media-rail', 'Cinematic media rail', 'CinematicMediaRail', 50, true, 'published'),
  ('home-community', 'community', 'Global operations', 'CommunitySection', 60, true, 'published')
on conflict (id) do update set label = excluded.label, component_key = excluded.component_key, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.homepage_ordering (section_key, sort_order, is_visible, status)
select section_key, sort_order, is_visible, status from public.homepage_sections
on conflict (section_key) do update set sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.site_navigation (id, label, href, sort_order, is_visible, status) values
  ('agri-drones', 'Agri Drones', '/agriculture', 10, true, 'published'),
  ('video-drones', 'Video Drones', '/video-drones', 20, true, 'published'),
  ('creative-drones', 'Creative Drones', '/creative-drones', 30, true, 'published'),
  ('survey-drones', 'Survey Drones', '/mapping', 40, true, 'published'),
  ('surveillance-drones', 'Surveillance Drones', '/surveillance', 50, true, 'published'),
  ('accessories', 'Accessories', '/accessories', 60, true, 'published'),
  ('our-franchise', 'Our Franchise', '#', 70, true, 'published')
on conflict (id) do update set label = excluded.label, href = excluded.href, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.footer_columns (id, title, sort_order, is_visible, status) values
  ('products', 'Products', 10, true, 'published'),
  ('operations', 'Operations', 20, true, 'published'),
  ('company', 'Company', 30, true, 'published')
on conflict (id) do update set title = excluded.title, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.footer_links (id, column_id, label, href, sort_order, is_visible, status) values
  ('footer-products-agri', 'products', 'Agri Drones', '/agriculture', 10, true, 'published'),
  ('footer-products-survey', 'products', 'Survey Drones', '/mapping', 20, true, 'published'),
  ('footer-products-surveillance', 'products', 'Surveillance Drones', '/surveillance', 30, true, 'published'),
  ('footer-products-spares', 'products', 'Drone Spares', '/accessories', 40, true, 'published'),
  ('footer-ops-aggregator', 'operations', 'Aggregator App', '/accessories', 10, true, 'published'),
  ('footer-ops-academics', 'operations', 'Academics', '/accessories', 20, true, 'published'),
  ('footer-ops-troubleshoot', 'operations', 'Troubleshoot', '/accessories', 30, true, 'published'),
  ('footer-ops-franchise', 'operations', 'Franchise & Export', '/industrial', 40, true, 'published'),
  ('footer-company-care', 'company', 'Drone Care Centers', '/product/mithron-care-plus', 10, true, 'published'),
  ('footer-company-pilot', 'company', 'Pilot Connect', '/login', 20, true, 'published'),
  ('footer-company-partner', 'company', 'Partner Network', '/industrial', 30, true, 'published'),
  ('footer-company-privacy', 'company', 'Privacy', '#', 40, true, 'published')
on conflict (id) do update set column_id = excluded.column_id, label = excluded.label, href = excluded.href, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.category_metadata (route_key, title, subtitle, hero_image, showcase_image, sort_order, is_visible, status) values
  ('agriculture', 'Agri drones', 'Precision spraying, seeding, crop monitoring, and farm automation systems for modern agriculture teams.', '/media/mithron/hero/ag10-command.webp', '{"src":"/media/mithron/catalog/agri-drone-category.png","alt":"Agri drone cinematic category showcase","width":1834,"height":858,"navbarInk":"dark"}'::jsonb, 10, true, 'published'),
  ('videoDrones', 'Video drones', 'Compact aerial imaging, field documentation, and creator-flight systems for training and visual operations.', '/media/mithron/hero/mapping-flight.webp', '{"src":"/media/mithron/catalog/video-drone-category.png","alt":"Video drone cinematic category showcase","width":1672,"height":941,"navbarInk":"light"}'::jsonb, 20, true, 'published'),
  ('creativeDrones', 'Creative drones', 'Drone soccer, academics, training labs, and creative aerospace programs for hands-on flight learning.', '/media/mithron/hero/security-grid.webp', '{"src":"/media/mithron/catalog/creative-drone-category.png","alt":"Creative drone cinematic category showcase","width":1915,"height":821,"navbarInk":"dark"}'::jsonb, 30, true, 'published'),
  ('accessories', 'All drones and spares', 'Autonomy cores, field controllers, payload systems, batteries, propellers, and deployment hardware for complete drone operations.', '/media/mithron/hero/mapping-flight.webp', '{"src":"/media/mithron/catalog/mithron-drone-category.png","alt":"Mithron accessories category showcase","width":1881,"height":836,"navbarInk":"light"}'::jsonb, 40, true, 'published'),
  ('industrial', 'Industrial inspection systems', 'Thermal monitoring, infrastructure analysis, and aerial intelligence for sites, utilities, and field teams.', '/media/mithron/hero/security-grid.webp', null, 50, true, 'published'),
  ('mapping', 'Survey drones', 'Survey-grade flight workflows, terrain intelligence, and RTK-ready aerial data systems.', '/media/mithron/hero/mapping-flight.webp', '{"src":"/media/mithron/catalog/survey-drone-category.png","alt":"Survey drone cinematic category showcase","width":1915,"height":821,"navbarInk":"dark"}'::jsonb, 60, true, 'published'),
  ('surveillance', 'Surveillance drone systems', 'Thermal awareness, perimeter monitoring, and aerial response systems for critical operations.', '/media/mithron/hero/security-grid.webp', '{"src":"/media/mithron/catalog/surveillance-drone-category.png","alt":"Surveillance drone cinematic category showcase","width":1915,"height":821,"navbarInk":"light"}'::jsonb, 70, true, 'published')
on conflict (route_key) do update set title = excluded.title, subtitle = excluded.subtitle, hero_image = excluded.hero_image, showcase_image = excluded.showcase_image, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.trust_cards (id, icon, title, body, image_src, image_alt, image_class_name, class_name, image_stage_class_name, is_feature, sort_order, is_visible, status) values
  ('fleet-inventory-control', 'boxes', 'Fleet inventory control', 'Aircraft, payloads, batteries, and field hardware staged for deployment.', '/optimized/product-cutouts/source-10l-agri-spraycopter.webp', 'Mithron agricultural spray drone cutout', 'h-[8.4rem] w-auto max-w-[108%] object-contain md:h-[8.9rem]', 'lg:col-span-1', 'items-end', false, 10, true, 'published'),
  ('secure-procurement-lanes', 'route', 'Secure procurement lanes', 'Clear quotes for aircraft, mission systems, components, and fleet expansion.', '/optimized/product-cutouts/source-v9-flight-controller-for-agriculture-drones.webp', 'Mithron flight controller cutout', 'h-[7.7rem] w-auto max-w-[108%] object-contain md:h-[8.2rem]', 'lg:col-span-1', null, false, 20, true, 'published'),
  ('deployment-assurance', 'shield-check', 'Deployment assurance', 'Pre-flight checks and field-readiness reviews for operating systems.', '/optimized/product-cutouts/source-mk2-flight-core.webp', 'Mithron flight core cutout', 'h-[8rem] w-auto max-w-[104%] object-contain md:h-[8.6rem]', 'lg:col-span-1', null, false, 30, true, 'published'),
  ('field-service-network', 'wrench', 'Field service network', 'Repair paths, parts access, and service continuity for active fleets.', '/optimized/product-cutouts/source-hobbywing-x6-plus-motor-with-propeller-combo.webp', 'Mithron drone motor service part cutout', 'h-[8.1rem] w-auto max-w-[104%] object-contain md:h-[8.7rem]', 'lg:col-span-1', null, false, 40, true, 'published'),
  ('operational-ecosystem-infrastructure', 'radar', 'Operational ecosystem infrastructure', 'Release pathways, service models, training modules, and operating support connected across one enterprise deployment network.', '/optimized/product-cutouts/source-drone-decafly-d5x.webp', 'Mithron drone frame cutout', 'h-[9.25rem] w-auto max-w-[92%] object-contain md:h-[10.65rem]', 'lg:col-span-2', 'items-end', true, 50, true, 'published'),
  ('operator-support-desk', 'life-buoy', 'Operator support desk', 'Technical guidance, onboarding support, and flight-system learning.', '/optimized/product-cutouts/source-transmitter-and-receiver-h12.webp', 'Mithron controller support cutout', 'h-[8.4rem] w-auto max-w-[100%] object-contain md:h-[9rem]', 'lg:col-span-1', null, false, 60, true, 'published'),
  ('pilot-response-network', 'radio-tower', 'Pilot response network', 'Pilot access for safer adoption, field response, and mission continuity.', '/optimized/product-cutouts/source-gnss-receiver-rs2-with-tripod-and-tribrach.webp', 'Mithron GNSS field kit cutout', 'h-[8.2rem] w-auto max-w-[98%] object-contain md:h-[8.8rem]', 'lg:col-span-1', null, false, 70, true, 'published')
on conflict (id) do update set icon = excluded.icon, title = excluded.title, body = excluded.body, image_src = excluded.image_src, image_alt = excluded.image_alt, image_class_name = excluded.image_class_name, class_name = excluded.class_name, image_stage_class_name = excluded.image_stage_class_name, is_feature = excluded.is_feature, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.faqs (id, scope, question, answer, sort_order, is_visible, status) values
  ('deployment-qualification', 'product-support', 'How does Mithron qualify a deployment?', 'Mithron aligns the selected aircraft, payload, operating region, operator readiness, and Drone Care requirements before the field plan moves forward.', 10, true, 'published'),
  ('multi-mission-stack', 'product-support', 'Can one stack support multiple mission profiles?', 'Yes. The ecosystem connects aircraft, controllers, batteries, payloads, mission planning, and service modules across agriculture, mapping, and surveillance workflows.', 20, true, 'published'),
  ('operator-support', 'product-support', 'How is operator support handled?', 'Training-first onboarding, service guidance, and field support are treated as part of the operating system rather than an afterthought.', 30, true, 'published')
on conflict (id) do update set question = excluded.question, answer = excluded.answer, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.product_reviews (id, reviewer_name, body, sort_order, is_visible, status) values
  ('smart-farm-team', 'Smart Farm Team', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 10, true, 'published'),
  ('survey-operations', 'Survey Operations', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 20, true, 'published'),
  ('industrial-safety-lead', 'Industrial Safety Lead', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 30, true, 'published')
on conflict (id) do update set reviewer_name = excluded.reviewer_name, body = excluded.body, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

do $$
declare
  public_table text;
begin
  foreach public_table in array array[
    'hero_banners', 'homepage_sections', 'section_visibility', 'site_navigation', 'footer_columns', 'footer_links', 'category_metadata', 'trust_cards', 'ecosystem_cards', 'deployment_locations', 'testimonials', 'product_reviews', 'faqs', 'media_assets', 'homepage_ordering', 'promotional_campaigns'
  ] loop
    execute format('drop policy if exists "%1$s public published read" on public.%1$I', public_table);
    execute format('create policy "%1$s public published read" on public.%1$I for select using (status = ''published'' and coalesce(is_visible, true) = true)', public_table);
    execute format('drop policy if exists "%1$s admin write" on public.%1$I', public_table);
    execute format('create policy "%1$s admin write" on public.%1$I for all to authenticated using (public.has_cms_permission(''cms.write'')) with check (public.has_cms_permission(''cms.write''))', public_table);
    execute format('drop policy if exists "%1$s service role manage" on public.%1$I', public_table);
    execute format('create policy "%1$s service role manage" on public.%1$I for all to service_role using (true) with check (true)', public_table);
  end loop;
end $$;

do $$
declare
  private_table text;
begin
  foreach private_table in array array['profiles', 'roles', 'permissions', 'user_roles', 'role_permissions', 'audit_logs'] loop
    execute format('drop policy if exists "%1$s authenticated read" on public.%1$I', private_table);
    execute format('create policy "%1$s authenticated read" on public.%1$I for select to authenticated using (public.has_cms_permission(''audit.read'') or public.has_cms_role(''super_admin''))', private_table);
    execute format('drop policy if exists "%1$s service role manage" on public.%1$I', private_table);
    execute format('create policy "%1$s service role manage" on public.%1$I for all to service_role using (true) with check (true)', private_table);
  end loop;
end $$;

do $$
declare
  ops_table text;
begin
  foreach ops_table in array array['inventory', 'orders', 'warehouse_stock', 'deployment_requests', 'staff_tasks'] loop
    execute format('drop policy if exists "%1$s operations read" on public.%1$I', ops_table);
    execute format('create policy "%1$s operations read" on public.%1$I for select to authenticated using (public.has_cms_permission(''warehouse.write'') or public.has_cms_permission(''orders.write'') or public.has_cms_permission(''operations.write''))', ops_table);
    execute format('drop policy if exists "%1$s operations write" on public.%1$I', ops_table);
    execute format('create policy "%1$s operations write" on public.%1$I for all to authenticated using (public.has_cms_permission(''warehouse.write'') or public.has_cms_permission(''orders.write'') or public.has_cms_permission(''operations.write'')) with check (public.has_cms_permission(''warehouse.write'') or public.has_cms_permission(''orders.write'') or public.has_cms_permission(''operations.write''))', ops_table);
    execute format('drop policy if exists "%1$s service role manage" on public.%1$I', ops_table);
    execute format('create policy "%1$s service role manage" on public.%1$I for all to service_role using (true) with check (true)', ops_table);
  end loop;
end $$;

create table if not exists public.role_inheritance (
  role_key text not null references public.roles(key) on delete cascade,
  inherited_role_key text not null references public.roles(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, inherited_role_key)
);

create table if not exists public.cms_pages (
  id text primary key,
  slug text not null unique,
  title text not null,
  meta_title text,
  meta_description text,
  route_path text not null,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'draft',
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cms_sections (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.cms_pages(id) on delete cascade,
  section_key text not null,
  component_key text not null,
  title text,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'draft',
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, section_key)
);

create table if not exists public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id text not null,
  revision integer not null,
  snapshot jsonb not null,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entity_table, entity_id, revision)
);

create table if not exists public.operation_routes (
  id text primary key,
  route_key text not null unique,
  label text not null,
  description text,
  href text not null,
  module_key text not null,
  required_role text not null default 'staff',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status public.cms_publish_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_media_assets (
  product_slug text not null,
  media_asset_id text not null references public.media_assets(id) on delete cascade,
  usage text not null default 'gallery',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_slug, media_asset_id, usage)
);

create or replace function public.has_cms_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive role_tree(role_key) as (
    select ur.role_key
    from public.user_roles ur
    where ur.user_id = auth.uid()
    union
    select ri.inherited_role_key
    from public.role_inheritance ri
    join role_tree rt on rt.role_key = ri.role_key
  )
  select exists (
    select 1
    from role_tree
    where role_key = required_role
      or role_key = 'super_admin'
  );
$$;

create or replace function public.has_cms_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive role_tree(role_key) as (
    select ur.role_key
    from public.user_roles ur
    where ur.user_id = auth.uid()
    union
    select ri.inherited_role_key
    from public.role_inheritance ri
    join role_tree rt on rt.role_key = ri.role_key
  )
  select exists (
    select 1
    from role_tree rt
    join public.role_permissions rp on rp.role_key = rt.role_key
    where rp.permission_key = required_permission
       or rt.role_key = 'super_admin'
  );
$$;

create or replace function public.record_content_revision(
  target_table text,
  target_id text,
  target_revision integer,
  target_snapshot jsonb,
  target_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_id uuid;
begin
  insert into public.content_revisions (entity_table, entity_id, revision, snapshot, change_summary, created_by)
  values (target_table, target_id, target_revision, target_snapshot, target_summary, auth.uid())
  returning id into revision_id;

  return revision_id;
end;
$$;

alter table public.role_inheritance enable row level security;
alter table public.cms_pages enable row level security;
alter table public.cms_sections enable row level security;
alter table public.content_revisions enable row level security;
alter table public.operation_routes enable row level security;
alter table public.product_media_assets enable row level security;

create index if not exists cms_pages_publish_idx on public.cms_pages (status, is_visible, sort_order);
create index if not exists cms_sections_publish_idx on public.cms_sections (page_id, status, is_visible, sort_order);
create index if not exists content_revisions_entity_idx on public.content_revisions (entity_table, entity_id, revision desc);
create index if not exists operation_routes_access_idx on public.operation_routes (required_role, status, is_visible, sort_order);
create index if not exists product_media_assets_product_idx on public.product_media_assets (product_slug, usage, sort_order);

insert into public.role_inheritance (role_key, inherited_role_key) values
  ('super_admin', 'admin'),
  ('admin', 'staff'),
  ('warehouse_manager', 'staff')
on conflict (role_key, inherited_role_key) do nothing;

insert into public.cms_pages (id, slug, title, meta_title, meta_description, route_path, sort_order, is_visible, status) values
  ('home', 'home', 'Homepage', 'Mithron Drone Ecosystem', 'Premium aerospace ecommerce homepage controlled by Supabase CMS.', '/', 10, true, 'published'),
  ('agriculture', 'agriculture', 'Agri drones', 'Mithron Agri Drones', 'Agriculture drone category metadata controlled by Supabase CMS.', '/agriculture', 20, true, 'published'),
  ('mapping', 'mapping', 'Survey drones', 'Mithron Survey Drones', 'Survey drone category metadata controlled by Supabase CMS.', '/mapping', 30, true, 'published'),
  ('surveillance', 'surveillance', 'Surveillance drones', 'Mithron Surveillance Drones', 'Surveillance category metadata controlled by Supabase CMS.', '/surveillance', 40, true, 'published')
on conflict (id) do update set title = excluded.title, meta_title = excluded.meta_title, meta_description = excluded.meta_description, route_path = excluded.route_path, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.cms_sections (page_id, section_key, component_key, title, payload, sort_order, is_visible, status) values
  ('home', 'hero', 'HeroCarousel', 'Hero carousel', '{"source":"hero_banners"}'::jsonb, 10, true, 'published'),
  ('home', 'product-icon-rail', 'ProductIconRail', 'Product shortcuts', '{"source":"mithron_products"}'::jsonb, 20, true, 'published'),
  ('home', 'trust', 'TrustSection', 'Operational trust cards', '{"source":"trust_cards"}'::jsonb, 40, true, 'published')
on conflict (page_id, section_key) do update set component_key = excluded.component_key, title = excluded.title, payload = excluded.payload, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

insert into public.operation_routes (id, route_key, label, description, href, module_key, required_role, sort_order, is_visible, status) values
  ('ops-dashboard', 'operations', 'Operations dashboard', 'Deployment request and field workflow overview.', '/operations', 'operations', 'staff', 10, true, 'published'),
  ('ops-requests', 'deployment-requests', 'Deployment requests', 'Field intake and assignment workflow.', '/operations/requests', 'operations', 'staff', 20, true, 'published'),
  ('ops-tasks', 'staff-tasks', 'Assigned tasks', 'Staff task queue and operational workflow status.', '/operations/tasks', 'tasks', 'staff', 30, true, 'published'),
  ('warehouse-inventory', 'inventory', 'Inventory', 'Warehouse stock and inventory control.', '/warehouse/inventory', 'warehouse', 'warehouse_manager', 40, true, 'published'),
  ('warehouse-orders', 'warehouse-orders', 'Orders', 'Warehouse order and fulfillment queue.', '/warehouse/orders', 'warehouse', 'warehouse_manager', 50, true, 'published')
on conflict (id) do update set label = excluded.label, description = excluded.description, href = excluded.href, module_key = excluded.module_key, required_role = excluded.required_role, sort_order = excluded.sort_order, is_visible = excluded.is_visible, status = excluded.status, updated_at = now();

do $$
begin
  alter publication supabase_realtime add table public.hero_banners;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.homepage_sections;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cms_pages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.media_assets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
declare
  cms_table text;
begin
  foreach cms_table in array array['cms_pages', 'cms_sections'] loop
    execute format('drop policy if exists "%1$s public published read" on public.%1$I', cms_table);
    execute format('create policy "%1$s public published read" on public.%1$I for select using (status = ''published'' and coalesce(is_visible, true) = true)', cms_table);
    execute format('drop policy if exists "%1$s admin write" on public.%1$I', cms_table);
    execute format('create policy "%1$s admin write" on public.%1$I for all to authenticated using (public.has_cms_permission(''cms.write'')) with check (public.has_cms_permission(''cms.write''))', cms_table);
    execute format('drop policy if exists "%1$s service role manage" on public.%1$I', cms_table);
    execute format('create policy "%1$s service role manage" on public.%1$I for all to service_role using (true) with check (true)', cms_table);
  end loop;
end $$;

do $$
declare
  private_table text;
begin
  foreach private_table in array array['role_inheritance', 'content_revisions'] loop
    execute format('drop policy if exists "%1$s authenticated read" on public.%1$I', private_table);
    execute format('create policy "%1$s authenticated read" on public.%1$I for select to authenticated using (public.has_cms_permission(''audit.read'') or public.has_cms_role(''super_admin''))', private_table);
    execute format('drop policy if exists "%1$s service role manage" on public.%1$I', private_table);
    execute format('create policy "%1$s service role manage" on public.%1$I for all to service_role using (true) with check (true)', private_table);
  end loop;
end $$;

drop policy if exists "operation_routes operations read" on public.operation_routes;
create policy "operation_routes operations read" on public.operation_routes for select to authenticated
using (public.has_cms_permission('operations.write') or public.has_cms_permission('warehouse.write') or public.has_cms_role('staff'));

drop policy if exists "operation_routes service role manage" on public.operation_routes;
create policy "operation_routes service role manage" on public.operation_routes for all to service_role using (true) with check (true);

drop policy if exists "product_media_assets admin read" on public.product_media_assets;
create policy "product_media_assets admin read" on public.product_media_assets for select to authenticated
using (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'));

drop policy if exists "product_media_assets admin write" on public.product_media_assets;
create policy "product_media_assets admin write" on public.product_media_assets for all to authenticated
using (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'))
with check (public.has_cms_permission('products.write') or public.has_cms_permission('media.write'));

drop policy if exists "product_media_assets service role manage" on public.product_media_assets;
create policy "product_media_assets service role manage" on public.product_media_assets for all to service_role using (true) with check (true);

