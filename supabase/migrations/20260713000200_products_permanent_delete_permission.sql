insert into public.permissions (key, label, description)
values ('products.permanent_delete', 'Permanent Product Delete', 'Force-delete archived products with operational references.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
values ('admin', 'products.permanent_delete')
on conflict (role_key, permission_key) do nothing;
