-- Post-parity audit remediation hardening (additive-safe cleanup).

-- Drop legacy wide-open mithron_assets policy; status-scoped policy remains.
drop policy if exists "mithron assets are publicly readable" on public.mithron_assets;

-- Drop duplicate security_events index (keep denial_idx).
drop index if exists public.security_events_type_idx;

-- Covering indexes for high-value unindexed foreign keys.
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists orders_created_by_user_id_idx on public.orders (created_by_user_id);
create index if not exists media_assets_created_by_idx on public.media_assets (created_by);
create index if not exists shipments_order_id_idx on public.shipments (order_id);
create index if not exists shipment_items_shipment_id_idx on public.shipment_items (shipment_id);
create index if not exists shipment_items_order_item_id_idx on public.shipment_items (order_item_id);
create index if not exists shipment_timeline_shipment_id_idx on public.shipment_timeline (shipment_id);

-- RLS initplan pattern: wrap auth.uid() in subselect for stable per-query evaluation.
drop policy if exists "profiles self or settings read" on public.profiles;
create policy "profiles self or settings read" on public.profiles
  for select to authenticated
  using (
    (id = (select auth.uid()))
    or public.has_cms_permission('settings.write')
    or public.has_cms_role('super_admin')
  );

drop policy if exists "user_roles self or settings read" on public.user_roles;
create policy "user_roles self or settings read" on public.user_roles
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or public.has_cms_permission('settings.write')
    or public.has_cms_role('super_admin')
  );

drop policy if exists "notifications recipient read" on public.notifications;
create policy "notifications recipient read" on public.notifications
  for select to authenticated
  using (
    (recipient_id = (select auth.uid()))
    or public.has_any_cms_permission(array['notifications.write', 'audit.read'])
  );

drop policy if exists "suppliers read own products" on public.mithron_products;
create policy "suppliers read own products" on public.mithron_products
  for select to authenticated
  using (supplier_id = (select auth.uid()));

-- service_role full manage on admin_settings (background jobs / provisioning).
drop policy if exists "admin_settings service role manage" on public.admin_settings;
create policy "admin_settings service role manage" on public.admin_settings
  for all to service_role
  using (true)
  with check (true);

-- Login callers are authenticated post-session; deny anon execute on role resolver.
revoke execute on function public.current_enterprise_role() from anon;

-- Reassign lone legacy operations_manager user before role cleanup.
update public.user_roles
set role_key = 'admin'
where user_id = '3ae94054-4f40-4560-9894-cd0ded762adc'
  and role_key = 'operations_manager';

-- Remove unreferenced legacy roles (keep canonical four).
delete from public.role_permissions
where role_key in (
  select r.key
  from public.roles r
  where r.key not in ('admin', 'warehouse', 'supplier', 'user')
    and not exists (select 1 from public.user_roles ur where ur.role_key = r.key)
    and not exists (select 1 from public.role_inheritance ri where ri.role_key = r.key or ri.inherited_role_key = r.key)
    and not exists (select 1 from public.admin_invites ai where ai.role_key = r.key)
);

delete from public.role_inheritance
where role_key in (
  select r.key from public.roles r
  where r.key not in ('admin', 'warehouse', 'supplier', 'user')
)
or inherited_role_key in (
  select r.key from public.roles r
  where r.key not in ('admin', 'warehouse', 'supplier', 'user')
);

delete from public.roles
where key not in ('admin', 'warehouse', 'supplier', 'user')
  and not exists (select 1 from public.user_roles ur where ur.role_key = roles.key)
  and not exists (select 1 from public.role_inheritance ri where ri.role_key = roles.key or ri.inherited_role_key = roles.key)
  and not exists (select 1 from public.admin_invites ai where ai.role_key = roles.key);

-- One-time log retention prune (60 days).
delete from public.audit_logs where created_at < now() - interval '60 days';
delete from public.activity_logs where created_at < now() - interval '60 days';
delete from public.security_events where created_at < now() - interval '60 days';

create or replace function public.prune_observability_logs(retention_days integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 7));
  v_audit bigint;
  v_activity bigint;
  v_security bigint;
begin
  delete from public.audit_logs where created_at < v_cutoff;
  get diagnostics v_audit = row_count;
  delete from public.activity_logs where created_at < v_cutoff;
  get diagnostics v_activity = row_count;
  delete from public.security_events where created_at < v_cutoff;
  get diagnostics v_security = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'audit_logs_deleted', v_audit,
    'activity_logs_deleted', v_activity,
    'security_events_deleted', v_security
  );
end;
$$;

revoke all on function public.prune_observability_logs(integer) from public;
revoke all on function public.prune_observability_logs(integer) from anon;
revoke all on function public.prune_observability_logs(integer) from authenticated;
grant execute on function public.prune_observability_logs(integer) to service_role;
