-- Canonical media is media_assets; mithron_assets is read-only legacy.

comment on table public.mithron_assets is 'DEPRECATED — canonical media is media_assets. Read-only legacy registry.';

revoke insert, update, delete on public.mithron_assets from anon;
revoke insert, update, delete on public.mithron_assets from authenticated;
