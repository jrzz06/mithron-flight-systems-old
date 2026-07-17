-- Deployment request pending contract alignment.
-- Additive/safe: normalize legacy "new" rows and make new inserts start at the
-- current operations workflow state without removing historical audit evidence.

update public.deployment_requests
set
  status = 'pending',
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'legacy_status_normalized_from', 'new',
    'legacy_status_normalized_at', now()
  ),
  updated_at = now()
where status = 'new';

alter table public.deployment_requests
  alter column status set default 'pending';
