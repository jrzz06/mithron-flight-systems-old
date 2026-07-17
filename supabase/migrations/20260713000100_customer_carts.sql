create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists customer_carts_updated_at_idx
  on public.customer_carts (updated_at desc);

alter table public.customer_carts enable row level security;

drop policy if exists "customer carts self read" on public.customer_carts;
create policy "customer carts self read" on public.customer_carts
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "customer carts self write" on public.customer_carts;
create policy "customer carts self write" on public.customer_carts
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "customer carts service role manage" on public.customer_carts;
create policy "customer carts service role manage" on public.customer_carts
for all to service_role using (true) with check (true);
