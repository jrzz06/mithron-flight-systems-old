alter table public.hero_banners
  add column if not exists title_color text default null,
  add column if not exists subtitle_color text default null;

comment on column public.hero_banners.title_color
  is 'Optional CSS colour override for the hero headline. NULL uses the theme default.';

comment on column public.hero_banners.subtitle_color
  is 'Optional CSS colour override for the hero subtitle. NULL uses the theme default.';
