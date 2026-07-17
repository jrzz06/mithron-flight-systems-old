-- Enterprise governance hardening:
-- direct user role deletes must fail explicitly instead of returning an ambiguous
-- PostgREST 200 with zero affected rows. Server-side governance actions continue
-- to use the service role path and remain unchanged.

create or replace function public.reject_direct_user_role_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return old;
  end if;

  raise exception 'Direct user role deletion is denied. Use the admin governance workflow.'
    using errcode = '42501';
end;
$$;

drop trigger if exists user_roles_reject_direct_delete on public.user_roles;
create trigger user_roles_reject_direct_delete
before delete on public.user_roles
for each row
execute function public.reject_direct_user_role_delete();

drop policy if exists "user_roles direct delete explicit deny" on public.user_roles;
create policy "user_roles direct delete explicit deny" on public.user_roles
for delete to authenticated
using (true);
