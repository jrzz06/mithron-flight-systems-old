-- Expand observability pruning for free-tier retention:
-- audit_logs, activity_logs, all aged notifications, content_revisions keep-last+age.
-- Also add partial unique index for media_assets (folder, content_hash) for upload retry dedupe.
-- Does NOT touch orders, payments, inventory, products, or other business tables.

-- Clear duplicate short hashes so the unique index can be created (legacy 8-char hashes).
with ranked as (
  select
    id,
    row_number() over (
      partition by folder, content_hash
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as rn
  from public.media_assets
  where content_hash is not null
)
update public.media_assets ma
set content_hash = null
from ranked r
where ma.id = r.id
  and r.rn > 1;

create unique index if not exists media_assets_folder_content_hash_uidx
  on public.media_assets (folder, content_hash)
  where content_hash is not null;

drop function if exists public.prune_observability_logs(integer);
drop function if exists public.prune_observability_logs(integer, integer, integer);

create or replace function public.prune_observability_logs(
  retention_days integer default 60,
  revision_keep_last integer default 15,
  revision_retention_days integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention integer := greatest(coalesce(retention_days, 60), 7);
  v_keep_last integer := greatest(coalesce(revision_keep_last, 15), 1);
  v_revision_retention integer := greatest(coalesce(revision_retention_days, 120), 7);
  v_cutoff timestamptz := now() - make_interval(days => v_retention);
  v_revision_cutoff timestamptz := now() - make_interval(days => v_revision_retention);
  v_audit bigint := 0;
  v_activity bigint := 0;
  v_security bigint := 0;
  v_notifications bigint := 0;
  v_revisions bigint := 0;
begin
  delete from public.audit_logs where created_at < v_cutoff;
  get diagnostics v_audit = row_count;

  delete from public.activity_logs where created_at < v_cutoff;
  get diagnostics v_activity = row_count;

  delete from public.security_events where created_at < v_cutoff;
  get diagnostics v_security = row_count;

  delete from public.notifications where created_at < v_cutoff;
  get diagnostics v_notifications = row_count;

  -- Keep newest keep_last per entity; always keep the newest revision (rn=1);
  -- drop surplus beyond keep_last; drop aged revisions beyond keep window except newest.
  with ranked as (
    select
      id,
      row_number() over (
        partition by entity_table, entity_id
        order by revision desc, created_at desc, id desc
      ) as rn
    from public.content_revisions
  )
  delete from public.content_revisions cr
  using ranked r
  where cr.id = r.id
    and (
      r.rn > v_keep_last
      or (cr.created_at < v_revision_cutoff and r.rn > 1)
    );
  get diagnostics v_revisions = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'revision_cutoff', v_revision_cutoff,
    'retention_days', v_retention,
    'revision_keep_last', v_keep_last,
    'revision_retention_days', v_revision_retention,
    'audit_logs_deleted', v_audit,
    'activity_logs_deleted', v_activity,
    'security_events_deleted', v_security,
    'notifications_deleted', v_notifications,
    'content_revisions_deleted', v_revisions
  );
end;
$$;

revoke all on function public.prune_observability_logs(integer, integer, integer) from public;
revoke all on function public.prune_observability_logs(integer, integer, integer) from anon;
revoke all on function public.prune_observability_logs(integer, integer, integer) from authenticated;
grant execute on function public.prune_observability_logs(integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
