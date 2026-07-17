alter table public.mithron_products
  add column if not exists workflow_status text not null default 'published',
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists is_visible boolean not null default true;

do $$
begin
  begin
    alter table public.mithron_products
      add constraint mithron_products_workflow_status_check
      check (workflow_status in ('draft', 'published', 'archived'));
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists mithron_products_workflow_status_idx
  on public.mithron_products (workflow_status);

create index if not exists mithron_products_is_visible_idx
  on public.mithron_products (is_visible);
