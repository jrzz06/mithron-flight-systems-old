-- Supabase hot-path performance indexes and RLS helper consolidation.
-- Additive and behavior-preserving: no table rewrites, no data changes, no RLS widening.

create index if not exists activity_logs_created_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_action_created_idx
  on public.activity_logs (action text_pattern_ops, created_at desc);

create index if not exists activity_logs_entity_created_idx
  on public.activity_logs (entity_table, created_at desc);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create index if not exists notifications_created_idx
  on public.notifications (created_at desc);

create index if not exists notifications_status_created_idx
  on public.notifications (status, created_at desc);

create index if not exists product_media_assets_primary_lookup_idx
  on public.product_media_assets (sort_order, product_slug, media_asset_id)
  where usage = 'primary' and is_primary = true;

create index if not exists product_media_assets_usage_variant_lookup_idx
  on public.product_media_assets (variant_id, sort_order, product_slug, media_asset_id)
  where usage = 'cms';

create index if not exists product_media_assets_updated_idx
  on public.product_media_assets (updated_at desc);

create index if not exists media_assets_created_idx
  on public.media_assets (created_at desc);

create index if not exists mithron_assets_created_idx
  on public.mithron_assets (created_at desc);

create index if not exists inventory_updated_idx
  on public.inventory (updated_at desc);

create index if not exists deployment_requests_updated_idx
  on public.deployment_requests (updated_at desc);

create index if not exists deployment_requests_status_updated_idx
  on public.deployment_requests (status, updated_at desc);

create index if not exists staff_tasks_updated_idx
  on public.staff_tasks (updated_at desc);

create index if not exists staff_tasks_status_updated_idx
  on public.staff_tasks (status, updated_at desc);

create index if not exists orders_updated_idx
  on public.orders (updated_at desc);

create index if not exists order_items_created_idx
  on public.order_items (created_at desc);

create index if not exists shipments_updated_idx
  on public.shipments (updated_at desc);

create index if not exists shipment_items_created_idx
  on public.shipment_items (created_at desc);

create index if not exists shipment_timeline_created_idx
  on public.shipment_timeline (created_at desc);

create index if not exists security_events_created_idx
  on public.security_events (created_at desc);

create or replace function public.has_any_cms_permission(required_permissions text[])
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
    left join public.role_permissions rp on rp.role_key = rt.role_key
    where rt.role_key = 'super_admin'
       or rp.permission_key = any(coalesce(required_permissions, array[]::text[]))
  );
$$;

revoke all on function public.has_any_cms_permission(text[]) from public;
grant execute on function public.has_any_cms_permission(text[]) to authenticated;
grant execute on function public.has_any_cms_permission(text[]) to service_role;

drop policy if exists "activity_logs admin write" on public.activity_logs;
create policy "activity_logs admin write" on public.activity_logs
for insert to authenticated
with check (public.has_any_cms_permission(array['audit.read', 'operations.write', 'warehouse.write', 'orders.write']));

drop policy if exists "inventory operational read" on public.inventory;
create policy "inventory operational read" on public.inventory
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'audit.read']));

drop policy if exists "warehouse_stock operational read" on public.warehouse_stock;
create policy "warehouse_stock operational read" on public.warehouse_stock
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'audit.read']));

drop policy if exists "inventory_movements warehouse insert" on public.inventory_movements;
create policy "inventory_movements warehouse insert" on public.inventory_movements
for insert to authenticated
with check (public.has_any_cms_permission(array['warehouse.write', 'orders.write']));

drop policy if exists "inventory_movements warehouse read" on public.inventory_movements;
create policy "inventory_movements warehouse read" on public.inventory_movements
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'audit.read']));

drop policy if exists "notifications recipient read" on public.notifications;
create policy "notifications recipient read" on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  or public.has_any_cms_permission(array['notifications.write', 'audit.read'])
);

drop policy if exists "order_items operations read" on public.order_items;
create policy "order_items operations read" on public.order_items
for select to authenticated
using (public.has_any_cms_permission(array['orders.write', 'warehouse.write', 'operations.write']));

drop policy if exists "orders operations read" on public.orders;
create policy "orders operations read" on public.orders
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write']));

drop policy if exists "orders operations write" on public.orders;
create policy "orders operations write" on public.orders
for all to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write']))
with check (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write']));

drop policy if exists "shipment_items warehouse read" on public.shipment_items;
create policy "shipment_items warehouse read" on public.shipment_items
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write', 'audit.read']));

drop policy if exists "shipment_items warehouse write" on public.shipment_items;
create policy "shipment_items warehouse write" on public.shipment_items
for insert to authenticated
with check (public.has_any_cms_permission(array['warehouse.write', 'orders.write']));

drop policy if exists "shipment_timeline warehouse insert" on public.shipment_timeline;
create policy "shipment_timeline warehouse insert" on public.shipment_timeline
for insert to authenticated
with check (public.has_any_cms_permission(array['warehouse.write', 'orders.write']));

drop policy if exists "shipment_timeline warehouse read" on public.shipment_timeline;
create policy "shipment_timeline warehouse read" on public.shipment_timeline
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write', 'audit.read']));

drop policy if exists "shipments warehouse read" on public.shipments;
create policy "shipments warehouse read" on public.shipments
for select to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write', 'operations.write', 'audit.read']));

drop policy if exists "shipments warehouse write" on public.shipments;
create policy "shipments warehouse write" on public.shipments
for all to authenticated
using (public.has_any_cms_permission(array['warehouse.write', 'orders.write']))
with check (public.has_any_cms_permission(array['warehouse.write', 'orders.write']));

notify pgrst, 'reload schema';
