-- Press coverage: CMS-managed "In the Press" editorial cards for the homepage.

create table if not exists public.press_coverage (
  id uuid primary key default gen_random_uuid(),
  publisher text not null,
  title text not null,
  description text not null default '',
  cover_image jsonb not null default '{}'::jsonb,
  external_url text not null,
  sort_order integer not null default 100,
  is_featured boolean not null default false,
  status public.cms_publish_status not null default 'draft',
  is_visible boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint press_coverage_title_len check (char_length(title) between 1 and 200),
  constraint press_coverage_publisher_len check (char_length(publisher) between 1 and 120),
  constraint press_coverage_description_len check (char_length(description) <= 600),
  constraint press_coverage_external_url_len check (char_length(external_url) between 8 and 1000),
  constraint press_coverage_external_url_https check (external_url ~ '^https?://')
);

create index if not exists press_coverage_published_idx
  on public.press_coverage (status, sort_order asc, published_at desc nulls last)
  where status = 'published' and coalesce(is_visible, true) = true and archived_at is null;

create index if not exists press_coverage_admin_status_idx
  on public.press_coverage (status, sort_order asc, updated_at desc);

create index if not exists press_coverage_featured_idx
  on public.press_coverage (is_featured, sort_order asc)
  where is_featured = true and status = 'published';

alter table public.press_coverage enable row level security;

drop policy if exists "press_coverage public published read" on public.press_coverage;
create policy "press_coverage public published read"
  on public.press_coverage
  for select
  using (
    status = 'published'
    and coalesce(is_visible, true) = true
    and archived_at is null
  );

drop policy if exists "press_coverage admin write" on public.press_coverage;
create policy "press_coverage admin write"
  on public.press_coverage
  for all
  to authenticated
  using (public.has_cms_permission('cms.write'))
  with check (public.has_cms_permission('cms.write'));

grant select on public.press_coverage to anon, authenticated;
grant insert, update, delete on public.press_coverage to authenticated;

insert into public.press_coverage (
  publisher,
  title,
  description,
  cover_image,
  external_url,
  sort_order,
  is_featured,
  status,
  is_visible,
  published_at
)
select *
from (
  values
    (
      'YOURSTORY',
      'Mithron Company Profile on YourStory',
      'Explore Mithron''s company profile, drone aggregation platform, milestones, and India''s growing drone service ecosystem.',
      jsonb_build_object(
        'url', '/media/mithron/mission/agrone/all-india-drone-farmer.png',
        'alt', 'Agricultural drone operations supporting Indian farmers and rural innovation'
      ),
      'https://yourstory.com/companies/mithron',
      10,
      true,
      'published'::public.cms_publish_status,
      true,
      now()
    ),
    (
      'CIO TECH OUTLOOK',
      'How Mithron is Advancing India''s Drone Ecosystem',
      'Learn how Mithron aggregates drone owners and pilots to deliver affordable agricultural spraying, calibrated field operations, and scalable drone services.',
      jsonb_build_object(
        'url', '/media/mithron/story/precision-spray.webp',
        'alt', 'Precision agriculture drone spraying over farmland'
      ),
      'https://www.ciotechoutlook.com/technology/drone-tech-startups/vendor/2025/mithron',
      20,
      true,
      'published'::public.cms_publish_status,
      true,
      now()
    ),
    (
      'TRACXN',
      'Mithron Company Snapshot & Market Profile',
      'View Mithron''s seed-stage company overview, funding history, sector classification, and competitive landscape across India''s drone market.',
      jsonb_build_object(
        'url', '/media/mithron/showcase/drone_world_hero.png',
        'alt', 'Mithron drone ecosystem and commercial operations overview'
      ),
      'https://tracxn.com/d/companies/mithronsmart/__FmiZvI2eEsKhWNfarQr2GubD-_ogeU7kHosSGe9dQSo',
      30,
      false,
      'published'::public.cms_publish_status,
      true,
      now()
    )
) as seed (
  publisher,
  title,
  description,
  cover_image,
  external_url,
  sort_order,
  is_featured,
  status,
  is_visible,
  published_at
)
where not exists (select 1 from public.press_coverage limit 1);
