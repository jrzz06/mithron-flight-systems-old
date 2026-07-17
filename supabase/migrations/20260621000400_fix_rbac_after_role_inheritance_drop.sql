-- role_inheritance was dropped in 20260619000500; restore direct role-permission checks.

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
    join public.role_permissions rp on rp.role_key = ur.role_key and rp.permission_key = required_permission
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and p.governance_status is distinct from 'disabled'
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
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
    where ur.user_id = auth.uid()
      and rp.permission_key = any(coalesce(required_permissions, array[]::text[]))
      and p.governance_status is distinct from 'disabled'
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role_key = 'super_admin'
      and p.governance_status is distinct from 'disabled'
  );
$$;

create or replace function public.assert_cms_write_permission()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return;
  end if;
  if not public.has_cms_permission('cms.write') then
    raise exception 'cms.write permission required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.has_cms_permission(text) from public;
revoke all on function public.has_cms_permission(text) from anon;
grant execute on function public.has_cms_permission(text) to authenticated, service_role;

revoke all on function public.has_any_cms_permission(text[]) from public;
revoke all on function public.has_any_cms_permission(text[]) from anon;
grant execute on function public.has_any_cms_permission(text[]) to authenticated, service_role;

revoke all on function public.assert_cms_write_permission() from public;
revoke all on function public.assert_cms_write_permission() from anon;
revoke all on function public.assert_cms_write_permission() from authenticated;
grant execute on function public.assert_cms_write_permission() to service_role;

notify pgrst, 'reload schema';
