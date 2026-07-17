-- Final auditability and security observability hardening.
-- Additive only: preserves existing RBAC/RLS enforcement, rollback paths, and storefront rendering.

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  attempted_resource text not null,
  denial_reason text,
  route_path text,
  http_status integer,
  severity text not null default 'warning' check (severity in ('info', 'notice', 'warning', 'critical')),
  source text not null default 'application',
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.security_events enable row level security;

create index if not exists security_events_actor_idx on public.security_events (actor_user_id, created_at desc);
create index if not exists security_events_type_idx on public.security_events (event_type, severity, created_at desc);
create index if not exists security_events_resource_idx on public.security_events (attempted_resource, created_at desc);
create unique index if not exists security_events_dedupe_idx on public.security_events (dedupe_key) where dedupe_key is not null;

drop policy if exists "security_events audit read" on public.security_events;
create policy "security_events audit read" on public.security_events
for select to authenticated
using (public.has_cms_permission('audit.read') or public.has_cms_role('super_admin'));

drop policy if exists "security_events service role manage" on public.security_events;
create policy "security_events service role manage" on public.security_events
for all to service_role
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.security_events;
exception
  when duplicate_object then null;
end $$;
