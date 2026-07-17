-- Production customer product reviews: extend schema, helpful votes, public read.

alter table public.customer_order_reviews
  add column if not exists title text not null default '',
  add column if not exists customer_name text,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists helpful_count integer not null default 0
    check (helpful_count >= 0),
  add column if not exists verified_purchase boolean not null default true;

alter table public.customer_order_reviews
  drop constraint if exists customer_order_reviews_title_len;

alter table public.customer_order_reviews
  add constraint customer_order_reviews_title_len
  check (char_length(title) <= 160);

alter table public.customer_order_reviews
  drop constraint if exists customer_order_reviews_body_len;

alter table public.customer_order_reviews
  add constraint customer_order_reviews_body_len
  check (char_length(body) between 1 and 4000);

create index if not exists customer_order_reviews_published_product_idx
  on public.customer_order_reviews (product_slug, created_at desc)
  where status = 'published';

create index if not exists customer_order_reviews_admin_status_idx
  on public.customer_order_reviews (status, rating, created_at desc);

create table if not exists public.product_review_helpful_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.customer_order_reviews(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  constraint product_review_helpful_votes_unique unique (review_id, voter_key)
);

create index if not exists product_review_helpful_votes_review_idx
  on public.product_review_helpful_votes (review_id);

alter table public.product_review_helpful_votes enable row level security;

drop policy if exists customer_order_reviews_public_read on public.customer_order_reviews;
create policy customer_order_reviews_public_read
  on public.customer_order_reviews
  for select
  using (status = 'published');

drop policy if exists customer_order_reviews_owner_write on public.customer_order_reviews;
create policy customer_order_reviews_owner_write
  on public.customer_order_reviews
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists customer_order_reviews_owner_delete on public.customer_order_reviews;
create policy customer_order_reviews_owner_delete
  on public.customer_order_reviews
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and status in ('pending', 'rejected'));

grant update, delete on public.customer_order_reviews to authenticated;
grant select on public.product_review_helpful_votes to anon, authenticated;
grant insert on public.product_review_helpful_votes to anon, authenticated;

drop policy if exists product_review_helpful_votes_insert on public.product_review_helpful_votes;
create policy product_review_helpful_votes_insert
  on public.product_review_helpful_votes
  for insert
  with check (true);

drop policy if exists product_review_helpful_votes_read on public.product_review_helpful_votes;
create policy product_review_helpful_votes_read
  on public.product_review_helpful_votes
  for select
  using (true);
