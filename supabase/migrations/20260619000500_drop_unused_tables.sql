-- Drop unused CMS/role tables (0 rows, no application queries).

drop table if exists public.ecosystem_cards cascade;
drop table if exists public.deployment_locations cascade;
drop table if exists public.role_inheritance cascade;
