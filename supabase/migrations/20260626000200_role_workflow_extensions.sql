-- Role workflow extensions: customer returns/reviews, supplier stock requests

do $$ begin
  create type public.return_request_status as enum (
    'requested', 'approved', 'received', 'refunded', 'rejected', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.customer_review_status as enum ('pending', 'published', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stock_request_status as enum ('pending', 'approved', 'rejected', 'applied');
exception when duplicate_object then null;
end $$;

create table if not exists public.order_return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  reason text not null,
  status public.return_request_status not null default 'requested',
  admin_note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_return_requests_idempotency_key_idx
  on public.order_return_requests (idempotency_key)
  where idempotency_key is not null;

create index if not exists order_return_requests_order_idx
  on public.order_return_requests (order_id, status, created_at desc);

create index if not exists order_return_requests_user_idx
  on public.order_return_requests (user_id, created_at desc);

create table if not exists public.customer_order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null,
  rating numeric(2, 1) not null check (rating >= 1 and rating <= 5),
  body text not null,
  status public.customer_review_status not null default 'pending',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_order_reviews_unique_per_item unique (order_id, product_slug, user_id)
);

create unique index if not exists customer_order_reviews_idempotency_key_idx
  on public.customer_order_reviews (idempotency_key)
  where idempotency_key is not null;

create index if not exists customer_order_reviews_product_idx
  on public.customer_order_reviews (product_slug, status, created_at desc);

create table if not exists public.supplier_stock_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.profiles(id) on delete cascade,
  product_slug text not null,
  requested_quantity integer not null check (requested_quantity >= 0),
  current_quantity integer,
  note text,
  status public.stock_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_stock_requests_idempotency_key_idx
  on public.supplier_stock_requests (idempotency_key)
  where idempotency_key is not null;

create index if not exists supplier_stock_requests_supplier_idx
  on public.supplier_stock_requests (supplier_id, status, created_at desc);

alter table public.order_return_requests enable row level security;
alter table public.customer_order_reviews enable row level security;
alter table public.supplier_stock_requests enable row level security;

drop policy if exists order_return_requests_owner_read on public.order_return_requests;
create policy order_return_requests_owner_read on public.order_return_requests
  for select using (user_id = (select auth.uid()));

drop policy if exists customer_order_reviews_owner_read on public.customer_order_reviews;
create policy customer_order_reviews_owner_read on public.customer_order_reviews
  for select using (user_id = (select auth.uid()));

drop policy if exists supplier_stock_requests_owner_read on public.supplier_stock_requests;
create policy supplier_stock_requests_owner_read on public.supplier_stock_requests
  for select using (supplier_id = (select auth.uid()));

revoke all on public.order_return_requests from anon, authenticated;
revoke all on public.customer_order_reviews from anon, authenticated;
revoke all on public.supplier_stock_requests from anon, authenticated;
grant select on public.order_return_requests to authenticated;
grant select on public.customer_order_reviews to authenticated;
grant select on public.supplier_stock_requests to authenticated;
