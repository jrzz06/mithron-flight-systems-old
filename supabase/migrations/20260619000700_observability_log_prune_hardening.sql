-- Extend observability pruning and remove redundant security activity mirrors.

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
  v_notifications bigint;
  v_security_mirrors bigint;
begin
  delete from public.audit_logs where created_at < v_cutoff;
  get diagnostics v_audit = row_count;

  delete from public.activity_logs where created_at < v_cutoff;
  get diagnostics v_activity = row_count;

  delete from public.security_events where created_at < v_cutoff;
  get diagnostics v_security = row_count;

  delete from public.notifications
  where created_at < v_cutoff
    and (status = 'read' or read_at is not null);
  get diagnostics v_notifications = row_count;

  -- Security events are canonical; mirrored activity rows are redundant noise.
  delete from public.activity_logs
  where entity_table = 'security_events';
  get diagnostics v_security_mirrors = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'audit_logs_deleted', v_audit,
    'activity_logs_deleted', v_activity,
    'security_events_deleted', v_security,
    'notifications_deleted', v_notifications,
    'security_activity_mirrors_deleted', v_security_mirrors
  );
end;
$$;

revoke all on function public.prune_observability_logs(integer) from public;
revoke all on function public.prune_observability_logs(integer) from anon;
revoke all on function public.prune_observability_logs(integer) from authenticated;
grant execute on function public.prune_observability_logs(integer) to service_role;
