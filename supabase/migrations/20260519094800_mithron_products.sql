create table if not exists public.mithron_products (
  slug text primary key,
  name text not null,
  tagline text not null,
  price numeric(12, 2) not null check (price >= 0),
  compare_at numeric(12, 2) check (compare_at is null or compare_at >= 0),
  badge text,
  category text not null,
  interests text[] not null default '{}',
  image jsonb not null,
  hero jsonb not null,
  gallery jsonb not null default '[]'::jsonb,
  hotspots jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  bundles jsonb not null default '[]'::jsonb,
  story jsonb not null default '[]'::jsonb,
  specs jsonb not null default '{}'::jsonb,
  anchors text[] not null default '{}',
  product_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mithron_products_category_idx
  on public.mithron_products (category);

create index if not exists mithron_products_interests_idx
  on public.mithron_products using gin (interests);

create index if not exists mithron_products_sort_order_idx
  on public.mithron_products (sort_order);

alter table public.mithron_products enable row level security;

drop policy if exists "mithron products are publicly readable" on public.mithron_products;
create policy "mithron products are publicly readable"
  on public.mithron_products
  for select
  using (true);

drop policy if exists "service role manages mithron products" on public.mithron_products;
create policy "service role manages mithron products"
  on public.mithron_products
  for all
  to service_role
  using (true)
  with check (true);
