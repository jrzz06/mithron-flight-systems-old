-- Expand control-plane realtime publication to tables already subscribed in ENTERPRISE_REALTIME_SCOPES.
-- Additive only: missing tables join supabase_realtime so admin/warehouse/supplier live sync can receive events.
-- RLS remains enforced for postgres_changes payloads.

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'mithron_products',
    'profiles',
    'user_roles',
    'warehouses',
    'enquiries',
    'contact_requests',
    'payments',
    'customer_addresses'
  ] loop
    if to_regclass(format('public.%I', realtime_table)) is not null then
      execute format('alter table public.%I replica identity full', realtime_table);
      begin
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      exception
        when duplicate_object then null;
        when undefined_object then null;
      end;
    end if;
  end loop;
end $$;
