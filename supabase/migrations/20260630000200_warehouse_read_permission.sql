-- Grant warehouse.read permission referenced by warehouse_configuration RLS.

insert into public.permissions (key, label, description)
values
  ('warehouse.read', 'Warehouse read', 'Read warehouse configuration and active warehouse directory')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
values
  ('warehouse', 'warehouse.read'),
  ('admin', 'warehouse.read')
on conflict (role_key, permission_key) do nothing;
