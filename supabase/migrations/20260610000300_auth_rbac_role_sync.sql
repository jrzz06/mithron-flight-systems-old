-- Auth RBAC role sync: ensure warehouse, supplier, and user resolve correctly.

insert into public.roles (key, label, description, sort_order)
values
  ('supplier', 'Supplier', 'Submit and manage own products pending admin approval.', 4)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

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

notify pgrst, 'reload schema';
