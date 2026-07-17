-- Restore the canonical warehouse role for the 3-role RBAC verifier.
-- Additive only: this keeps legacy warehouse_manager records intact.

insert into public.roles (key, label, description, sort_order)
values ('warehouse', 'Warehouse', 'Inventory, shipment, stock, and order-fulfillment access.', 2)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_key, permission_key)
select role_key, permission_key
from (
  values
    ('warehouse', 'warehouse.write'),
    ('warehouse', 'orders.write'),
    ('warehouse', 'notifications.write')
) as grants(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
