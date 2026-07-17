create table if not exists public.demo_access_accounts (
  id uuid primary key,
  email text not null unique,
  role_key text not null references public.roles(key) on delete restrict,
  label text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_access_accounts_enabled_sort_idx
  on public.demo_access_accounts (enabled, sort_order, email);

alter table public.demo_access_accounts enable row level security;

drop policy if exists "demo_access_accounts service role manage" on public.demo_access_accounts;
create policy "demo_access_accounts service role manage"
  on public.demo_access_accounts
  for all
  to service_role
  using (true)
  with check (true);

insert into public.demo_access_accounts (id, email, role_key, label, sort_order)
values
  ('a0000000-0000-4000-8000-000000000001', 'demo@gmail.com', 'admin', 'Admin demo', 1),
  ('a0000000-0000-4000-8000-000000000002', 'demo2@gmail.com', 'supplier', 'Supplier demo', 2),
  ('a0000000-0000-4000-8000-000000000003', 'demo3@gmail.com', 'warehouse', 'Warehouse demo', 3)
on conflict (id) do update
set
  email = excluded.email,
  role_key = excluded.role_key,
  label = excluded.label,
  sort_order = excluded.sort_order,
  enabled = true,
  updated_at = now();

notify pgrst, 'reload schema';
