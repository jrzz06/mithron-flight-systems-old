-- Blog posts: production content entity for admin CRUD + storefront listing/detail.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text not null default '',
  body text not null default '',
  body_json jsonb,
  cover_image jsonb not null default '{}'::jsonb,
  category text not null default '',
  tags text[] not null default '{}',
  author text not null default 'Mithron',
  reading_time_minutes integer not null default 3
    check (reading_time_minutes >= 1 and reading_time_minutes <= 120),
  is_featured boolean not null default false,
  published_at timestamptz,
  seo_title text,
  meta_description text,
  related_product_slugs text[] not null default '{}',
  status public.cms_publish_status not null default 'draft',
  is_visible boolean not null default true,
  revision integer not null default 1,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_slug_unique unique (slug),
  constraint blog_posts_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint blog_posts_title_len check (char_length(title) between 1 and 200),
  constraint blog_posts_excerpt_len check (char_length(excerpt) <= 600),
  constraint blog_posts_seo_title_len check (seo_title is null or char_length(seo_title) <= 160),
  constraint blog_posts_meta_description_len check (meta_description is null or char_length(meta_description) <= 320)
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (status, published_at desc nulls last)
  where status = 'published' and coalesce(is_visible, true) = true and archived_at is null;

create index if not exists blog_posts_admin_status_idx
  on public.blog_posts (status, updated_at desc);

create index if not exists blog_posts_featured_idx
  on public.blog_posts (is_featured, published_at desc)
  where is_featured = true and status = 'published';

alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts public published read" on public.blog_posts;
create policy "blog_posts public published read"
  on public.blog_posts
  for select
  using (
    status = 'published'
    and coalesce(is_visible, true) = true
    and archived_at is null
  );

drop policy if exists "blog_posts admin write" on public.blog_posts;
create policy "blog_posts admin write"
  on public.blog_posts
  for all
  to authenticated
  using (public.has_cms_permission('cms.write'))
  with check (public.has_cms_permission('cms.write'));

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;
