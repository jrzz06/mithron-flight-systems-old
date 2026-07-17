-- Expand admin realtime coverage for supplier governance and warehouse profiles.
-- Additive only: profiles, user_roles, warehouses join supabase_realtime publication.

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'profiles',
    'user_roles',
    'warehouses'
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
