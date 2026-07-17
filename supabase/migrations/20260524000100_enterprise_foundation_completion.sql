-- Mithron enterprise foundation completion.
-- Additive only: this migration does not drop or overwrite storefront tables.

alter table public.orders
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists fulfillment_status text not null default 'pending',
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists invoice_url text,
  add column if not exists shipment_tracking jsonb not null default '{}'::jsonb;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_slug text not null,
  product_name text not null,
  bundle_id text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  channel text not null default 'admin',
  title text not null,
  body text,
  status text not null default 'unread',
  priority text not null default 'normal',
  entity_table text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_key text not null references public.roles(key) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_items enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.admin_invites enable row level security;

create index if not exists orders_payment_fulfillment_idx on public.orders (payment_status, fulfillment_status, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id, product_slug);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, status, created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_id, created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_table, entity_id, created_at desc);
create index if not exists admin_invites_token_idx on public.admin_invites (token_hash, status);
create index if not exists admin_invites_email_idx on public.admin_invites (email, status);

insert into public.roles (key, label, description, sort_order) values
  ('admin', 'Admin', 'Full admin, CMS, product, media, order, warehouse, settings, and audit access.', 1),
  ('warehouse', 'Warehouse', 'Inventory, shipment, stock, and order-fulfillment access.', 2),
  ('user', 'User', 'Storefront-only customer access.', 3)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.permissions (key, label, description) values
  ('cms.write', 'Write CMS', 'Create and update CMS content.'),
  ('products.write', 'Write Products', 'Create and update product catalog data.'),
  ('media.write', 'Write Media', 'Upload and manage media assets.'),
  ('warehouse.write', 'Write Warehouse', 'Manage inventory and stock operations.'),
  ('orders.write', 'Write Orders', 'Manage order and fulfillment state.'),
  ('settings.write', 'Write Settings', 'Manage global platform settings.'),
  ('audit.read', 'Read Audit', 'View activity history and audit logs.'),
  ('notifications.write', 'Write Notifications', 'Create operational notifications.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key
from (
  values
    ('admin', 'cms.write'), ('admin', 'products.write'), ('admin', 'media.write'), ('admin', 'warehouse.write'), ('admin', 'orders.write'), ('admin', 'settings.write'), ('admin', 'audit.read'), ('admin', 'notifications.write'),
    ('warehouse', 'warehouse.write'), ('warehouse', 'orders.write'), ('warehouse', 'notifications.write')
) as grants(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;

drop policy if exists "order_items operations read" on public.order_items;
create policy "order_items operations read" on public.order_items for select to authenticated
using (public.has_cms_permission('orders.write') or public.has_cms_permission('warehouse.write'));

drop policy if exists "order_items operations write" on public.order_items;
create policy "order_items operations write" on public.order_items for all to authenticated
using (public.has_cms_permission('orders.write'))
with check (public.has_cms_permission('orders.write'));

drop policy if exists "notifications recipient read" on public.notifications;
create policy "notifications recipient read" on public.notifications for select to authenticated
using (recipient_id = auth.uid() or public.has_cms_permission('notifications.write') or public.has_cms_permission('audit.read'));

drop policy if exists "notifications admin write" on public.notifications;
create policy "notifications admin write" on public.notifications for all to authenticated
using (public.has_cms_permission('notifications.write'))
with check (public.has_cms_permission('notifications.write'));

drop policy if exists "activity_logs audit read" on public.activity_logs;
create policy "activity_logs audit read" on public.activity_logs for select to authenticated
using (public.has_cms_permission('audit.read'));

drop policy if exists "activity_logs admin write" on public.activity_logs;
create policy "activity_logs admin write" on public.activity_logs for insert to authenticated
with check (public.has_cms_permission('audit.read') or public.has_cms_permission('warehouse.write') or public.has_cms_permission('orders.write'));

drop policy if exists "admin_invites settings read" on public.admin_invites;
create policy "admin_invites settings read" on public.admin_invites for select to authenticated
using (public.has_cms_permission('settings.write'));

drop policy if exists "admin_invites settings write" on public.admin_invites;
create policy "admin_invites settings write" on public.admin_invites for all to authenticated
using (public.has_cms_permission('settings.write'))
with check (public.has_cms_permission('settings.write'));

drop policy if exists "order_items service role manage" on public.order_items;
create policy "order_items service role manage" on public.order_items for all to service_role using (true) with check (true);

drop policy if exists "notifications service role manage" on public.notifications;
create policy "notifications service role manage" on public.notifications for all to service_role using (true) with check (true);

drop policy if exists "activity_logs service role manage" on public.activity_logs;
create policy "activity_logs service role manage" on public.activity_logs for all to service_role using (true) with check (true);

drop policy if exists "admin_invites service role manage" on public.admin_invites;
create policy "admin_invites service role manage" on public.admin_invites for all to service_role using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_logs;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
