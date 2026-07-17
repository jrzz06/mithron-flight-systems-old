-- Notification read-state and dedupe hardening.
-- Additive only: no behavior change for existing rows or policies.
--   1. dedupe_key column + unique index so business events (e.g. "order X paid")
--      can be inserted idempotently via PostgREST on_conflict=dedupe_key.
--   2. Partial index for fast "unread notifications for this entity" lookups
--      that power new-order row highlighting in admin/warehouse order lists.
--   3. Recipient-scoped security definer RPCs to mark notifications read.
--      RLS on notifications has no user UPDATE policy, so read-state writes
--      go through these functions which enforce recipient_id = auth.uid().

alter table public.notifications
  add column if not exists dedupe_key text;

-- Plain unique index: Postgres allows unlimited NULLs, so rows without a
-- dedupe key are unaffected, and PostgREST on_conflict inference works.
create unique index if not exists notifications_dedupe_key_idx
  on public.notifications (dedupe_key);

create index if not exists notifications_unread_entity_idx
  on public.notifications (recipient_id, entity_table, entity_id)
  where status = 'unread';

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
      and recipient_id = auth.uid()
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
    where recipient_id = auth.uid()
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
    where recipient_id = auth.uid()
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
