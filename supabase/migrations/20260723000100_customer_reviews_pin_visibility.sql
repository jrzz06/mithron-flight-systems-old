-- CMS modernization: independent hide/show and pin for customer reviews.
alter table public.customer_order_reviews
  add column if not exists is_visible boolean not null default true,
  add column if not exists pinned boolean not null default false,
  add column if not exists display_order integer not null default 0;

create index if not exists customer_order_reviews_home_featured_idx
  on public.customer_order_reviews (pinned desc, display_order asc, created_at desc)
  where status = 'published' and is_visible = true;

comment on column public.customer_order_reviews.is_visible is 'Soft hide from storefront without changing moderation status.';
comment on column public.customer_order_reviews.pinned is 'Pin to homepage featured reviews / manual ordering.';
comment on column public.customer_order_reviews.display_order is 'Manual sort key; lower values appear first when pinned/manual.';
