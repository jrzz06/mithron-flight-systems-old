-- Restore the canonical storefront user role for the 3-role RBAC verifier.
-- Additive only: this does not grant permissions or change admin/warehouse access.

insert into public.roles (key, label, description, sort_order)
values ('user', 'User', 'Storefront-only customer access.', 3)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;
