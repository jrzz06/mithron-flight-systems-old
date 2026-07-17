-- Idempotent RLS hardening for product_merge_audit (environments that applied the table without RLS).

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'product_merge_audit'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.product_merge_audit enable row level security';
  end if;
end $$;

drop policy if exists "product_merge_audit service role manage" on public.product_merge_audit;
create policy "product_merge_audit service role manage"
  on public.product_merge_audit
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.product_merge_audit from anon, authenticated;
grant all on table public.product_merge_audit to service_role;
