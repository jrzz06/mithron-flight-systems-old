-- Procurement platform baseline: supplier role, product approval, enquiries, addresses, payments.

do $$
begin
  create type public.enquiry_status as enum ('new', 'contacted', 'qualified', 'won', 'lost', 'converted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum ('requires_payment', 'processing', 'succeeded', 'failed', 'refunded');
exception
  when duplicate_object then null;
end $$;

insert into public.roles (key, label, description, sort_order)
values ('supplier', 'Supplier', 'Submit and manage own products pending admin approval.', 4)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.permissions (key, label, description) values
  ('products.submit', 'Submit Products', 'Create and submit supplier-owned products for review.'),
  ('enquiries.read', 'Read Enquiries', 'View customer product enquiries.'),
  ('enquiries.write', 'Write Enquiries', 'Create and manage customer enquiries.'),
  ('payments.write', 'Write Payments', 'Manage payment records and gateway operations.'),
  ('reports.read', 'Read Reports', 'View operational and sales reports.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key
from (
  values
    ('supplier', 'products.submit'),
    ('supplier', 'media.write'),
    ('supplier', 'notifications.write'),
    ('admin', 'products.submit'),
    ('admin', 'enquiries.read'),
    ('admin', 'enquiries.write'),
    ('admin', 'payments.write'),
    ('admin', 'reports.read'),
    ('user', 'enquiries.write')
) as grants(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;

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
    where p.id = auth.uid()
      and p.governance_status is distinct from 'disabled'
  ),
  current_roles as (
    select ur.role_key, coalesce(rp.priority, 999) as priority
    from public.user_roles ur
    join active_profile p on p.id = ur.user_id
    left join role_priority rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
  )
  select role_key
  from current_roles
  order by priority, role_key
  limit 1;
$$;

revoke all on function public.current_enterprise_role() from public;
grant execute on function public.current_enterprise_role() to authenticated;

alter table public.mithron_products
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists supplier_id uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.mithron_products drop constraint if exists mithron_products_workflow_status_check;

alter table public.mithron_products
  add constraint mithron_products_workflow_status_check
  check (workflow_status in ('draft', 'pending_review', 'published', 'archived', 'rejected'));

create index if not exists mithron_products_supplier_idx
  on public.mithron_products (supplier_id, workflow_status, updated_at desc);

alter table public.orders
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_created_by_user_idx
  on public.orders (created_by_user_id, created_at desc);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  subject text not null,
  body text not null,
  related_product_slug text,
  region text,
  status public.enquiry_status not null default 'new',
  assigned_to uuid references auth.users(id) on delete set null,
  converted_order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  city text not null,
  region text not null,
  postal_code text not null,
  country text not null default 'India',
  phone text,
  is_default boolean not null default false,
  is_billing boolean not null default true,
  is_shipping boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'stub',
  provider_intent_id text,
  provider_payment_id text,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  status public.payment_status not null default 'requires_payment',
  webhook_payload jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enquiries_status_idx on public.enquiries (status, created_at desc);
create index if not exists enquiries_customer_idx on public.enquiries (customer_user_id, created_at desc);
create index if not exists customer_addresses_user_idx on public.customer_addresses (user_id, is_default desc);
create index if not exists payments_order_idx on public.payments (order_id, status, created_at desc);

alter table public.enquiries enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.payments enable row level security;

drop policy if exists "enquiries customer read own" on public.enquiries;
create policy "enquiries customer read own" on public.enquiries
for select to authenticated
using (customer_user_id = auth.uid());

drop policy if exists "enquiries customer insert own" on public.enquiries;
create policy "enquiries customer insert own" on public.enquiries
for insert to authenticated
with check (customer_user_id = auth.uid() or customer_user_id is null);

drop policy if exists "enquiries admin read" on public.enquiries;
create policy "enquiries admin read" on public.enquiries
for select to authenticated
using (public.has_cms_permission('enquiries.read'));

drop policy if exists "enquiries admin write" on public.enquiries;
create policy "enquiries admin write" on public.enquiries
for all to authenticated
using (public.has_cms_permission('enquiries.write'))
with check (public.has_cms_permission('enquiries.write'));

drop policy if exists "enquiries service role manage" on public.enquiries;
create policy "enquiries service role manage" on public.enquiries
for all to service_role using (true) with check (true);

drop policy if exists "customer addresses self read" on public.customer_addresses;
create policy "customer addresses self read" on public.customer_addresses
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "customer addresses self write" on public.customer_addresses;
create policy "customer addresses self write" on public.customer_addresses
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "customer addresses service role manage" on public.customer_addresses;
create policy "customer addresses service role manage" on public.customer_addresses
for all to service_role using (true) with check (true);

drop policy if exists "payments customer read own order" on public.payments;
create policy "payments customer read own order" on public.payments
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = payments.order_id
      and o.created_by_user_id = auth.uid()
  )
);

drop policy if exists "payments ops read" on public.payments;
create policy "payments ops read" on public.payments
for select to authenticated
using (public.has_cms_permission('payments.write') or public.has_cms_permission('orders.write'));

drop policy if exists "payments service role manage" on public.payments;
create policy "payments service role manage" on public.payments
for all to service_role using (true) with check (true);

drop policy if exists "orders customer read own" on public.orders;
create policy "orders customer read own" on public.orders
for select to authenticated
using (
  created_by_user_id = auth.uid()
  or public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write'])
);

drop policy if exists "order items customer read own" on public.order_items;
create policy "order items customer read own" on public.order_items
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.created_by_user_id = auth.uid()
  )
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('operations.write')
);

notify pgrst, 'reload schema';
