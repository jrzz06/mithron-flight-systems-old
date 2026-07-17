-- Production RPC hardening: revoke public/anon execute on privileged SECURITY DEFINER functions.

-- Trigger-only / internal functions: no direct RPC access
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    'public.assign_content_revision_number()'::regprocedure,
    'public.enforce_order_fulfillment_transition()'::regprocedure,
    'public.reject_direct_user_role_delete()'::regprocedure
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
exception
  when undefined_function then null;
end $$;

-- CMS revision RPCs: authenticated + service_role only (not anon)
revoke all on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) from public;
revoke all on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) from anon;
grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to authenticated, service_role;

revoke all on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) from public;
revoke all on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) from anon;
grant execute on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) to authenticated, service_role;

revoke all on function public.record_content_revision(text, text, integer, jsonb, text) from public;
revoke all on function public.record_content_revision(text, text, integer, jsonb, text) from anon;
grant execute on function public.record_content_revision(text, text, integer, jsonb, text) to authenticated, service_role;

-- Fulfillment: service role only
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from public;
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from anon;
revoke all on function public.fulfill_order_and_deduct_stock(uuid, text, text) from authenticated;
grant execute on function public.fulfill_order_and_deduct_stock(uuid, text, text) to service_role;

-- Report RPCs: service role only (when present)
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    'public.report_sales_by_period(integer)'::regprocedure,
    'public.report_supplier_throughput()'::regprocedure,
    'public.report_low_stock_summary()'::regprocedure,
    'public.report_revenue_by_status()'::regprocedure
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
exception
  when undefined_function then null;
end $$;

-- Permission helpers: authenticated only, with disabled-profile gate
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
  );
$$;

revoke all on function public.has_cms_permission(text) from public;
revoke all on function public.has_cms_permission(text) from anon;
grant execute on function public.has_cms_permission(text) to authenticated, service_role;

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
    where ur.user_id = auth.uid()
      and ur.role_key = required_role
      and p.governance_status is distinct from 'disabled'
  );
$$;

revoke all on function public.has_cms_role(text) from public;
revoke all on function public.has_cms_role(text) from anon;
grant execute on function public.has_cms_role(text) to authenticated, service_role;

-- Fix user_roles DELETE deny policy
drop policy if exists "user_roles direct delete explicit deny" on public.user_roles;
create policy "user_roles direct delete explicit deny"
  on public.user_roles
  for delete
  to authenticated
  using (false);

create index if not exists user_roles_role_key_idx on public.user_roles (role_key);

notify pgrst, 'reload schema';
