-- M10: Wrap remaining bare auth.uid() in (select auth.uid()) for initplan caching.
-- Additive / behavior-identical: same rows readable/writable by the same users.
-- Only policies/functions that still used bare auth.uid() are rewritten.
--
-- Rollback (restore prior definitions):
--
-- customer_addresses self write (20260611000100):
--   drop policy if exists "customer addresses self write" on public.customer_addresses;
--   create policy "customer addresses self write" on public.customer_addresses
--   for all to authenticated
--   using (user_id = auth.uid())
--   with check (user_id = auth.uid());
--
-- suppliers read own products (20260801000100):
--   drop policy if exists "suppliers read own products" on public.mithron_products;
--   create policy "suppliers read own products"
--     on public.mithron_products for select to authenticated
--     using (supplier_id = auth.uid());
--
-- Notification RPCs (20260721000100) used recipient_id = auth.uid() in:
--   mark_notifications_read, mark_entity_notifications_read, mark_all_notifications_read

-- ---------------------------------------------------------------------------
-- customer_addresses write (read policy was dropped as redundant in 20260727000300;
-- the ALL write policy still used bare auth.uid())
-- ---------------------------------------------------------------------------
drop policy if exists "customer addresses self write" on public.customer_addresses;
create policy "customer addresses self write" on public.customer_addresses
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- mithron_products supplier self-read
-- ---------------------------------------------------------------------------
drop policy if exists "suppliers read own products" on public.mithron_products;
create policy "suppliers read own products"
  on public.mithron_products
  for select
  to authenticated
  using (supplier_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Notification read-state RPCs (security definer; recipient scoped)
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set status = 'read',
        read_at = now(),
        updated_at = now()
    where id = any(coalesce(p_ids, array[]::uuid[]))
      and recipient_id = (select auth.uid())
      and status = 'unread'
    returning 1
  )
  select coalesce(count(*), 0)::integer from updated;
$$;

create or replace function public.mark_entity_notifications_read(
  p_entity_table text,
  p_entity_id text
)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set status = 'read',
        read_at = now(),
        updated_at = now()
    where recipient_id = (select auth.uid())
      and entity_table = p_entity_table
      and entity_id = p_entity_id
      and status = 'unread'
    returning 1
  )
  select coalesce(count(*), 0)::integer from updated;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set status = 'read',
        read_at = now(),
        updated_at = now()
    where recipient_id = (select auth.uid())
      and status = 'unread'
    returning 1
  )
  select coalesce(count(*), 0)::integer from updated;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to service_role;

revoke all on function public.mark_entity_notifications_read(text, text) from public;
grant execute on function public.mark_entity_notifications_read(text, text) to authenticated;
grant execute on function public.mark_entity_notifications_read(text, text) to service_role;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_all_notifications_read() to service_role;

notify pgrst, 'reload schema';
