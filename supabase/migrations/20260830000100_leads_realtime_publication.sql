-- Publish unified leads table to supabase_realtime so admin dashboard / nav
-- badges refresh when leads are created or converted.

do $$
begin
  if to_regclass('public.leads') is not null then
    execute 'alter table public.leads replica identity full';
    begin
      execute 'alter publication supabase_realtime add table public.leads';
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end $$;
