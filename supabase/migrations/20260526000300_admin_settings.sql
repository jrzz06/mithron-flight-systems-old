create table if not exists public.admin_settings (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings settings read" on public.admin_settings;
create policy "admin_settings settings read" on public.admin_settings for select to authenticated
using (public.has_cms_permission('settings.write'));

drop policy if exists "admin_settings settings write" on public.admin_settings;
create policy "admin_settings settings write" on public.admin_settings for all to authenticated
using (public.has_cms_permission('settings.write'))
with check (public.has_cms_permission('settings.write'));

create index if not exists admin_settings_updated_idx on public.admin_settings (updated_at desc);
