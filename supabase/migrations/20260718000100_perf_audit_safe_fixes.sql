-- Production optimization audit (docs/production-optimization-audit-2026-07-10.md)
-- Safe, additive/behavior-identical fixes only:
--   1. Composite partial index to speed up the daily payment-expire cron scan (OPT-028)
--   2. RLS initplan fix for cart tables: wrap auth.uid() in a subselect so Postgres
--      evaluates it once per statement instead of once per row (OPT-029). Access
--      behavior is unchanged — same rows are readable/writable by the same users.

-- OPT-028: app/api/payments/expire-pending/route.ts filters
-- status=eq.pending_payment & payment_status=eq.requires_payment & created_at=lt.<cutoff>.
-- Existing orders_status_idx (status, created_at) and orders_payment_fulfillment_idx
-- (payment_status, fulfillment_status, created_at) do not cover this triple filter.
create index if not exists orders_expire_pending_idx
  on public.orders (status, payment_status, created_at)
  where status = 'pending_payment' and payment_status = 'requires_payment';

-- OPT-029: customer_carts RLS policies (20260713000100_customer_carts.sql) use bare
-- auth.uid(); rewrap in (select auth.uid()) per the established pattern.
drop policy if exists "customer carts self read" on public.customer_carts;
create policy "customer carts self read" on public.customer_carts
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "customer carts self write" on public.customer_carts;
create policy "customer carts self write" on public.customer_carts
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- customer_cart_idempotency RLS policies (20260708000200_cart_idempotency.sql)
-- use bare auth.uid(); rewrap the same way.
drop policy if exists "customer cart idempotency self read" on public.customer_cart_idempotency;
create policy "customer cart idempotency self read" on public.customer_cart_idempotency
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "customer cart idempotency self write" on public.customer_cart_idempotency;
create policy "customer cart idempotency self write" on public.customer_cart_idempotency
for insert to authenticated
with check (user_id = (select auth.uid()));
