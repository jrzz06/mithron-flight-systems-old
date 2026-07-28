-- Allow multiple reviews per user on the same product (one per purchase/order).
-- Drop the one-review-per-product unique index and restore per-order-item uniqueness.

drop index if exists public.customer_order_reviews_unique_customer_per_product_uidx;

create unique index if not exists customer_order_reviews_unique_per_order_item_uidx
  on public.customer_order_reviews (order_id, product_slug, user_id)
  where order_id is not null and user_id is not null;
