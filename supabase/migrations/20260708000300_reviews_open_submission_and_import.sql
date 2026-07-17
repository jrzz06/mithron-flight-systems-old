-- Open product reviews: allow non-purchase reviews + Wix import support.

alter table public.customer_order_reviews
  alter column order_id drop not null,
  alter column user_id drop not null;

-- Replace "one per order item" with "one per user per product" for customer-submitted reviews.
alter table public.customer_order_reviews
  drop constraint if exists customer_order_reviews_unique_per_item;

alter table public.customer_order_reviews
  add column if not exists source text not null default 'customer',
  add column if not exists external_id text,
  add column if not exists product_name text;

create unique index if not exists customer_order_reviews_external_uidx
  on public.customer_order_reviews (source, external_id)
  where external_id is not null;

create unique index if not exists customer_order_reviews_unique_customer_per_product_uidx
  on public.customer_order_reviews (product_slug, user_id)
  where source = 'customer' and user_id is not null;

-- Keep status-based public read policy; ensure authenticated can insert their own customer reviews.
drop policy if exists customer_order_reviews_owner_insert on public.customer_order_reviews;
create policy customer_order_reviews_owner_insert
  on public.customer_order_reviews
  for insert
  to authenticated
  with check (source = 'customer' and user_id = (select auth.uid()));

grant insert on public.customer_order_reviews to authenticated;

