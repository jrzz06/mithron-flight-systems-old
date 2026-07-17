-- Links Firebase sign-in subjects to canonical Supabase auth.users rows.
-- Service-role only; no client policies (same pattern as admin_invites provisioning).

create table public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in (
    'firebase_google',
    'firebase_phone',
    'firebase_anonymous'
  )),
  provider_subject text not null,
  provider_email text,
  provider_phone text,
  linked_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index auth_identities_user_id_idx on public.auth_identities (user_id);
create index auth_identities_provider_email_idx on public.auth_identities (provider_email)
  where provider_email is not null;
create index auth_identities_provider_phone_idx on public.auth_identities (provider_phone)
  where provider_phone is not null;

alter table public.auth_identities enable row level security;

revoke all on table public.auth_identities from anon, authenticated;
