-- Warehouse operators must not inherit operations/staff permissions.
-- This preserves warehouse and order fulfillment access while blocking direct
-- operations-platform writes through RLS.

delete from public.role_inheritance
where role_key = 'warehouse_manager'
  and inherited_role_key = 'staff';

notify pgrst, 'reload schema';
