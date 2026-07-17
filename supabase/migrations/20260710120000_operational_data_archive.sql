-- Operational data archive: cold storage tables, monthly RPC, and CSV bucket.

-- Archive tables (mirror live schemas + archived_at stamp)
create table if not exists public.orders_archive (
  like public.orders including all
);
alter table public.orders_archive
  add column if not exists archived_at timestamptz not null default now();

create table if not exists public.order_items_archive (
  like public.order_items including all
);
alter table public.order_items_archive
  add column if not exists archived_at timestamptz not null default now();

create table if not exists public.enquiries_archive (
  like public.enquiries including all
);
alter table public.enquiries_archive
  add column if not exists archived_at timestamptz not null default now();

create table if not exists public.contact_requests_archive (
  like public.contact_requests including all
);
alter table public.contact_requests_archive
  add column if not exists archived_at timestamptz not null default now();

create table if not exists public.activity_logs_archive (
  like public.activity_logs including all
);
alter table public.activity_logs_archive
  add column if not exists archived_at timestamptz not null default now();

create table if not exists public.audit_logs_archive (
  like public.audit_logs including all
);
alter table public.audit_logs_archive
  add column if not exists archived_at timestamptz not null default now();

create index if not exists orders_archive_created_idx on public.orders_archive (created_at desc);
create index if not exists orders_archive_archived_idx on public.orders_archive (archived_at desc);
create index if not exists order_items_archive_order_idx on public.order_items_archive (order_id);
create index if not exists enquiries_archive_created_idx on public.enquiries_archive (created_at desc);
create index if not exists contact_requests_archive_created_idx on public.contact_requests_archive (created_at desc);
create index if not exists activity_logs_archive_created_idx on public.activity_logs_archive (created_at desc);
create index if not exists audit_logs_archive_created_idx on public.audit_logs_archive (created_at desc);

alter table public.orders_archive enable row level security;
alter table public.order_items_archive enable row level security;
alter table public.enquiries_archive enable row level security;
alter table public.contact_requests_archive enable row level security;
alter table public.activity_logs_archive enable row level security;
alter table public.audit_logs_archive enable row level security;

drop policy if exists "orders_archive audit read" on public.orders_archive;
create policy "orders_archive audit read" on public.orders_archive
for select to authenticated
using (
  public.has_cms_permission('audit.read')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "orders_archive service role manage" on public.orders_archive;
create policy "orders_archive service role manage" on public.orders_archive
for all to service_role using (true) with check (true);

drop policy if exists "order_items_archive audit read" on public.order_items_archive;
create policy "order_items_archive audit read" on public.order_items_archive
for select to authenticated
using (
  public.has_cms_permission('audit.read')
  or public.has_cms_permission('orders.write')
);

drop policy if exists "order_items_archive service role manage" on public.order_items_archive;
create policy "order_items_archive service role manage" on public.order_items_archive
for all to service_role using (true) with check (true);

drop policy if exists "enquiries_archive audit read" on public.enquiries_archive;
create policy "enquiries_archive audit read" on public.enquiries_archive
for select to authenticated
using (
  public.has_cms_permission('audit.read')
  or public.has_cms_permission('enquiries.write')
);

drop policy if exists "enquiries_archive service role manage" on public.enquiries_archive;
create policy "enquiries_archive service role manage" on public.enquiries_archive
for all to service_role using (true) with check (true);

drop policy if exists "contact_requests_archive audit read" on public.contact_requests_archive;
create policy "contact_requests_archive audit read" on public.contact_requests_archive
for select to authenticated
using (
  public.has_cms_permission('audit.read')
  or public.has_cms_permission('enquiries.write')
);

drop policy if exists "contact_requests_archive service role manage" on public.contact_requests_archive;
create policy "contact_requests_archive service role manage" on public.contact_requests_archive
for all to service_role using (true) with check (true);

drop policy if exists "activity_logs_archive audit read" on public.activity_logs_archive;
create policy "activity_logs_archive audit read" on public.activity_logs_archive
for select to authenticated
using (public.has_cms_permission('audit.read'));

drop policy if exists "activity_logs_archive service role manage" on public.activity_logs_archive;
create policy "activity_logs_archive service role manage" on public.activity_logs_archive
for all to service_role using (true) with check (true);

drop policy if exists "audit_logs_archive audit read" on public.audit_logs_archive;
create policy "audit_logs_archive audit read" on public.audit_logs_archive
for select to authenticated
using (public.has_cms_permission('audit.read'));

drop policy if exists "audit_logs_archive service role manage" on public.audit_logs_archive;
create policy "audit_logs_archive service role manage" on public.audit_logs_archive
for all to service_role using (true) with check (true);

-- Run manifest
create table if not exists public.data_archive_runs (
  id uuid primary key default gen_random_uuid(),
  run_month date not null,
  entity text not null,
  rows_archived int not null default 0,
  csv_storage_path text,
  status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_archive_runs_month_idx on public.data_archive_runs (run_month desc, entity);

alter table public.data_archive_runs enable row level security;

drop policy if exists "data_archive_runs audit read" on public.data_archive_runs;
create policy "data_archive_runs audit read" on public.data_archive_runs
for select to authenticated
using (public.has_cms_permission('audit.read'));

drop policy if exists "data_archive_runs service role manage" on public.data_archive_runs;
create policy "data_archive_runs service role manage" on public.data_archive_runs
for all to service_role using (true) with check (true);

-- Private CSV archive bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mithron-data-archives',
  'mithron-data-archives',
  false,
  52428800,
  array['text/csv', 'text/plain', 'application/csv']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mithron data archives audit read" on storage.objects;
create policy "mithron data archives audit read" on storage.objects
for select to authenticated
using (
  bucket_id = 'mithron-data-archives'
  and public.has_cms_permission('audit.read')
);

drop policy if exists "mithron data archives service role manage" on storage.objects;
create policy "mithron data archives service role manage" on storage.objects
for all to service_role
using (bucket_id = 'mithron-data-archives')
with check (bucket_id = 'mithron-data-archives');

create or replace function public.archive_operational_data(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 7));
  v_run_started timestamptz := now();
  v_orders bigint := 0;
  v_order_items bigint := 0;
  v_enquiries bigint := 0;
  v_contact_requests bigint := 0;
  v_activity_logs bigint := 0;
  v_audit_logs bigint := 0;
  v_order_ids uuid[];
begin
  -- Unlink FK references before order deletion
  with eligible_orders as (
    select o.id
    from public.orders o
    where o.created_at < v_cutoff
      and (
        o.status in ('delivered', 'cancelled', 'refunded')
        or o.archived_at is not null
        or o.deleted_at is not null
      )
      and o.status not in ('paid', 'admin_review', 'pending_payment', 'draft', 'confirmed', 'assigned', 'processing', 'packed', 'dispatched', 'in_transit')
      and coalesce(o.fulfillment_status, 'pending') not in ('processing', 'picked', 'packed', 'ready_to_dispatch', 'shipped', 'assigned')
  )
  select coalesce(array_agg(id), '{}') into v_order_ids from eligible_orders;

  if coalesce(array_length(v_order_ids, 1), 0) > 0 then
    update public.enquiries
    set converted_order_id = null,
        updated_at = now()
    where converted_order_id = any(v_order_ids);

    update public.contact_requests
    set converted_order_id = null,
        updated_at = now()
    where converted_order_id = any(v_order_ids);

    with moved_items as (
      insert into public.order_items_archive
      select oi.*, v_run_started
      from public.order_items oi
      where oi.order_id = any(v_order_ids)
      on conflict (id) do nothing
      returning 1
    )
    select count(*) into v_order_items from moved_items;

    with moved_orders as (
      delete from public.orders o
      where o.id = any(v_order_ids)
      returning o.*
    ),
    inserted as (
      insert into public.orders_archive
      select m.*, v_run_started from moved_orders m
      on conflict (id) do nothing
      returning 1
    )
    select count(*) into v_orders from inserted;
  end if;

  with moved as (
    delete from public.enquiries e
    where e.created_at < v_cutoff
      and e.deleted_at is null
      and (
        e.status in ('lost', 'converted')
        or e.archived_at is not null
      )
    returning e.*
  ),
  inserted as (
    insert into public.enquiries_archive
    select m.*, v_run_started from moved m
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_enquiries from inserted;

  with moved as (
    delete from public.contact_requests cr
    where cr.created_at < v_cutoff
      and cr.deleted_at is null
      and cr.status in ('archived', 'rejected', 'converted')
    returning cr.*
  ),
  inserted as (
    insert into public.contact_requests_archive
    select m.*, v_run_started from moved m
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_contact_requests from inserted;

  with moved as (
    delete from public.activity_logs al
    where al.created_at < v_cutoff
    returning al.*
  ),
  inserted as (
    insert into public.activity_logs_archive
    select m.*, v_run_started from moved m
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_activity_logs from inserted;

  with moved as (
    delete from public.audit_logs al
    where al.created_at < v_cutoff
    returning al.*
  ),
  inserted as (
    insert into public.audit_logs_archive
    select m.*, v_run_started from moved al
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_audit_logs from inserted;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'run_started', v_run_started,
    'retention_days', greatest(retention_days, 7),
    'orders_archived', v_orders,
    'order_items_archived', v_order_items,
    'enquiries_archived', v_enquiries,
    'contact_requests_archived', v_contact_requests,
    'activity_logs_archived', v_activity_logs,
    'audit_logs_archived', v_audit_logs
  );
end;
$$;

revoke all on function public.archive_operational_data(integer) from public;
revoke all on function public.archive_operational_data(integer) from anon;
revoke all on function public.archive_operational_data(integer) from authenticated;
grant execute on function public.archive_operational_data(integer) to service_role;

-- Prune observability logs: skip activity/audit (archived separately); only prune security_events and read notifications.
create or replace function public.prune_observability_logs(retention_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(retention_days, 7));
  v_security bigint;
  v_notifications bigint;
  v_security_mirrors bigint;
begin
  delete from public.security_events where created_at < v_cutoff;
  get diagnostics v_security = row_count;

  delete from public.notifications
  where created_at < v_cutoff
    and (status = 'read' or read_at is not null);
  get diagnostics v_notifications = row_count;

  delete from public.activity_logs
  where entity_table = 'security_events';
  get diagnostics v_security_mirrors = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'audit_logs_deleted', 0,
    'activity_logs_deleted', 0,
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

notify pgrst, 'reload schema';
