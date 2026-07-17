-- Full audit remediation Stage 1 (safe / additive):
-- 1. Covering indexes for unindexed foreign keys
-- 2. Hot lookup indexes (orders.customer_email, profiles warehouse assignment)
-- 3. pg_trgm GIN for archive ilike search
-- 4. Wrap auth.uid() in RBAC helpers as (select auth.uid()) for initplan caching
-- 5. Pin search_path on inventory helper functions
-- Behavior and permissions are unchanged.

-- ---------------------------------------------------------------------------
-- 1) Covering FK indexes
-- ---------------------------------------------------------------------------
create index if not exists admin_invites_accepted_by_idx
  on public.admin_invites (accepted_by);
create index if not exists admin_invites_invited_by_idx
  on public.admin_invites (invited_by);
create index if not exists admin_invites_role_key_idx
  on public.admin_invites (role_key);

create index if not exists admin_settings_updated_by_idx
  on public.admin_settings (updated_by);

create index if not exists cms_pages_created_by_idx
  on public.cms_pages (created_by);
create index if not exists cms_pages_updated_by_idx
  on public.cms_pages (updated_by);

create index if not exists cms_sections_created_by_idx
  on public.cms_sections (created_by);
create index if not exists cms_sections_updated_by_idx
  on public.cms_sections (updated_by);

create index if not exists contact_requests_assigned_to_idx
  on public.contact_requests (assigned_to);
create index if not exists contact_requests_converted_order_id_idx
  on public.contact_requests (converted_order_id);

create index if not exists content_revisions_created_by_idx
  on public.content_revisions (created_by);

create index if not exists customer_order_reviews_order_id_idx
  on public.customer_order_reviews (order_id);
create index if not exists customer_order_reviews_user_id_idx
  on public.customer_order_reviews (user_id);

create index if not exists demo_access_accounts_role_key_idx
  on public.demo_access_accounts (role_key);

create index if not exists deployment_requests_assigned_to_idx
  on public.deployment_requests (assigned_to);
create index if not exists deployment_requests_order_id_idx
  on public.deployment_requests (order_id);

create index if not exists enquiries_assigned_to_idx
  on public.enquiries (assigned_to);
create index if not exists enquiries_converted_order_id_idx
  on public.enquiries (converted_order_id);
create index if not exists enquiries_related_product_slug_idx
  on public.enquiries (related_product_slug);

create index if not exists hero_banners_created_by_idx
  on public.hero_banners (created_by);
create index if not exists hero_banners_product_slug_idx
  on public.hero_banners (product_slug);
create index if not exists hero_banners_updated_by_idx
  on public.hero_banners (updated_by);

create index if not exists inventory_updated_by_idx
  on public.inventory (updated_by);

create index if not exists mithron_products_approved_by_idx
  on public.mithron_products (approved_by);
create index if not exists mithron_products_submitted_by_idx
  on public.mithron_products (submitted_by);

create index if not exists order_return_requests_order_item_id_idx
  on public.order_return_requests (order_item_id);

create index if not exists press_coverage_created_by_idx
  on public.press_coverage (created_by);
create index if not exists press_coverage_updated_by_idx
  on public.press_coverage (updated_by);

create index if not exists profiles_assigned_warehouse_code_idx
  on public.profiles (assigned_warehouse_code)
  where assigned_warehouse_code is not null;
create index if not exists profiles_disabled_by_idx
  on public.profiles (disabled_by);
create index if not exists profiles_reactivated_by_idx
  on public.profiles (reactivated_by);

create index if not exists promotional_campaigns_media_asset_id_idx
  on public.promotional_campaigns (media_asset_id);

create index if not exists shipment_timeline_actor_user_id_idx
  on public.shipment_timeline (actor_user_id);

create index if not exists site_navigation_parent_id_idx
  on public.site_navigation (parent_id);

create index if not exists staff_tasks_created_by_idx
  on public.staff_tasks (created_by);
create index if not exists staff_tasks_related_request_id_idx
  on public.staff_tasks (related_request_id);

create index if not exists warehouse_configuration_checkout_idx
  on public.warehouse_configuration (checkout_warehouse_code);
create index if not exists warehouse_configuration_default_idx
  on public.warehouse_configuration (default_warehouse_code);
create index if not exists warehouse_configuration_supplier_idx
  on public.warehouse_configuration (supplier_intake_warehouse_code);

-- ---------------------------------------------------------------------------
-- 2) Hot lookup / search indexes
-- ---------------------------------------------------------------------------
create index if not exists orders_customer_email_idx
  on public.orders (customer_email);

create extension if not exists pg_trgm;

create index if not exists orders_customer_email_trgm_idx
  on public.orders using gin (customer_email gin_trgm_ops);
create index if not exists orders_order_number_trgm_idx
  on public.orders using gin (order_number gin_trgm_ops);

-- expire-pending composite already exists as orders_expire_pending_idx (20260718000100)

-- ---------------------------------------------------------------------------
-- 3) RBAC helpers: evaluate auth.uid() once per statement
-- ---------------------------------------------------------------------------
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
    join public.role_permissions rp
      on rp.role_key = ur.role_key and rp.permission_key = required_permission
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.governance_status is distinct from 'disabled'
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role_key = 'super_admin'
      and p.governance_status is distinct from 'disabled'
  );
$$;

create or replace function public.has_any_cms_permission(required_permissions text[])
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
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and rp.permission_key = any(coalesce(required_permissions, array[]::text[]))
      and p.governance_status is distinct from 'disabled'
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role_key = 'super_admin'
      and p.governance_status is distinct from 'disabled'
  );
$$;

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
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role_key = required_role
      and p.governance_status is distinct from 'disabled'
  );
$$;

create or replace function public.current_enterprise_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with role_priority(role_key, priority) as (
    values
      ('super_admin', 10),
      ('admin', 20),
      ('operations_manager', 30),
      ('warehouse_manager', 40),
      ('warehouse', 45),
      ('warehouse_staff', 50),
      ('supplier', 55),
      ('editor', 60),
      ('support', 70),
      ('staff', 80),
      ('reviewer', 90),
      ('user', 95)
  ),
  active_profile as (
    select p.id
    from public.profiles p
    where p.id = (select auth.uid())
      and p.governance_status is distinct from 'disabled'
  ),
  current_roles as (
    select ur.role_key, coalesce(rp.priority, 999) as priority
    from public.user_roles ur
    join active_profile p on p.id = ur.user_id
    left join role_priority rp on rp.role_key = ur.role_key
    where ur.user_id = (select auth.uid())
  )
  select role_key
  from current_roles
  order by priority, role_key
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4) Pin search_path on inventory helpers
-- ---------------------------------------------------------------------------
create or replace function public.derive_product_sku(slug text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      regexp_replace(
        upper(regexp_replace(trim(coalesce(slug, '')), '[^A-Za-z0-9]+', '-', 'g')),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'SKU'
  );
$$;

create or replace function public.enforce_canonical_inventory_sku()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.sku := public.derive_product_sku(new.product_slug);
  return new;
end;
$$;

create or replace function public.resolve_default_warehouse_code()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select wc.checkout_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    (
      select w.code
      from public.warehouses w
      where w.is_active = true
      order by w.code asc
      limit 1
    ),
    'IN-WEST-01'
  );
$$;

create or replace function public.sync_inventory_to_product_and_warehouse()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_label text;
  v_warehouse text;
begin
  v_label := case new.stock_status
    when 'out_of_stock' then 'Out of stock'
    when 'low_stock' then 'Low stock'
    else 'In stock'
  end;

  v_warehouse := coalesce(
    (
      select wc.checkout_warehouse_code
      from public.warehouse_configuration wc
      where wc.id = 'global'
      limit 1
    ),
    public.resolve_default_warehouse_code()
  );

  update public.mithron_products
  set
    source_availability = v_label,
    updated_at = now()
  where slug = new.product_slug;

  insert into public.warehouse_stock (
    warehouse_code,
    product_slug,
    sku,
    available_quantity,
    committed_quantity,
    updated_at
  )
  values (
    v_warehouse,
    new.product_slug,
    new.sku,
    new.quantity,
    0,
    now()
  )
  on conflict (warehouse_code, product_slug, sku)
  do update set
    available_quantity = excluded.available_quantity,
    updated_at = now();

  return new;
end;
$$;
