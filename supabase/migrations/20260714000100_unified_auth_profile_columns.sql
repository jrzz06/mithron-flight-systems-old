-- Unified auth profile columns for full_name and avatar_url
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text;

update public.profiles
set full_name = display_name
where full_name is null
  and display_name is not null;
