-- Additive RBAC alignment for real authenticated workflow validation.
-- Keeps user_roles private while exposing only the current authenticated role.

insert into public.role_permissions (role_key, permission_key)
values
  ('admin', 'warehouse.write'),
  ('admin', 'settings.write')
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
      ('warehouse_staff', 50),
      ('editor', 60),
      ('support', 70),
      ('staff', 80),
      ('reviewer', 90)
  ),
  current_roles as (
    select ur.role_key, coalesce(rp.priority, 999) as priority
    from public.user_roles ur
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

drop policy if exists "profiles authenticated read" on public.profiles;
create policy "profiles self or settings read" on public.profiles
for select to authenticated
using (id = auth.uid() or public.has_cms_permission('settings.write') or public.has_cms_role('super_admin'));

drop policy if exists "user_roles authenticated read" on public.user_roles;
create policy "user_roles self or settings read" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.has_cms_permission('settings.write') or public.has_cms_role('super_admin'));

drop policy if exists "inventory operations read" on public.inventory;
create policy "inventory operational read" on public.inventory
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "inventory operations write" on public.inventory;
create policy "inventory warehouse write" on public.inventory
for all to authenticated
using (public.has_cms_permission('warehouse.write'))
with check (public.has_cms_permission('warehouse.write'));

drop policy if exists "warehouse_stock operations read" on public.warehouse_stock;
create policy "warehouse_stock operational read" on public.warehouse_stock
for select to authenticated
using (
  public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('orders.write')
  or public.has_cms_permission('audit.read')
);

drop policy if exists "warehouse_stock operations write" on public.warehouse_stock;
create policy "warehouse_stock warehouse write" on public.warehouse_stock
for all to authenticated
using (public.has_cms_permission('warehouse.write'))
with check (public.has_cms_permission('warehouse.write'));

drop policy if exists "deployment_requests operations read" on public.deployment_requests;
create policy "deployment_requests operations read" on public.deployment_requests
for select to authenticated
using (public.has_cms_permission('operations.write'));

drop policy if exists "deployment_requests operations write" on public.deployment_requests;
create policy "deployment_requests operations write" on public.deployment_requests
for all to authenticated
using (public.has_cms_permission('operations.write'))
with check (public.has_cms_permission('operations.write'));

drop policy if exists "staff_tasks operations read" on public.staff_tasks;
create policy "staff_tasks operations read" on public.staff_tasks
for select to authenticated
using (public.has_cms_permission('operations.write'));

drop policy if exists "staff_tasks operations write" on public.staff_tasks;
create policy "staff_tasks operations write" on public.staff_tasks
for all to authenticated
using (public.has_cms_permission('operations.write'))
with check (public.has_cms_permission('operations.write'));

notify pgrst, 'reload schema';
