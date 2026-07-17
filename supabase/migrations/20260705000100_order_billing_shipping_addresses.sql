-- Normalized order address references (immutable snapshots remain in orders.metadata)

alter table public.orders
  add column if not exists shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  add column if not exists billing_address_id uuid references public.customer_addresses(id) on delete set null;

create index if not exists orders_shipping_address_id_idx
  on public.orders (shipping_address_id)
  where shipping_address_id is not null;

create index if not exists orders_billing_address_id_idx
  on public.orders (billing_address_id)
  where billing_address_id is not null;

create index if not exists customer_addresses_user_shipping_idx
  on public.customer_addresses (user_id, is_default desc, created_at desc)
  where is_shipping = true;

create index if not exists customer_addresses_user_billing_idx
  on public.customer_addresses (user_id, is_default desc, created_at desc)
  where is_billing = true;

alter table public.customer_addresses
  drop constraint if exists customer_addresses_usage_check;

alter table public.customer_addresses
  add constraint customer_addresses_usage_check
  check (is_billing = true or is_shipping = true);

-- Backfill FK columns from existing metadata for signed-in checkout orders
update public.orders o
set
  shipping_address_id = coalesce(
    o.shipping_address_id,
    nullif(o.metadata->>'shipping_address_id', '')::uuid
  ),
  billing_address_id = coalesce(
    o.billing_address_id,
    nullif(o.metadata->>'billing_address_id', '')::uuid
  )
where o.metadata ? 'shipping_address_id'
   or o.metadata ? 'billing_address_id';
