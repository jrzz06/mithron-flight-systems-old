create table if not exists public.customer_cart_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  operation text null,
  primary key (user_id, idempotency_key)
);

create index if not exists customer_cart_idempotency_created_at_idx
  on public.customer_cart_idempotency (created_at desc);

alter table public.customer_cart_idempotency enable row level security;

drop policy if exists "customer cart idempotency self read" on public.customer_cart_idempotency;
create policy "customer cart idempotency self read" on public.customer_cart_idempotency
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "customer cart idempotency self write" on public.customer_cart_idempotency;
create policy "customer cart idempotency self write" on public.customer_cart_idempotency
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "customer cart idempotency service role manage" on public.customer_cart_idempotency;
create policy "customer cart idempotency service role manage" on public.customer_cart_idempotency
for all to service_role using (true) with check (true);

