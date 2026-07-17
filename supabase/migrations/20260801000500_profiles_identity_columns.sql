-- Canonical identity fields on profiles for lookups without exposing auth_identities to clients.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists firebase_uid text;

create unique index if not exists profiles_firebase_uid_unique_idx
  on public.profiles (firebase_uid)
  where firebase_uid is not null;

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null;
