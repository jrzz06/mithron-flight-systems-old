-- Warehouse operator profiles, unique warehouse names, and removal of test orphan warehouses.

alter table public.profiles
  add column if not exists assigned_warehouse_code text;

alter table public.profiles
  drop constraint if exists profiles_assigned_warehouse_fk;

alter table public.profiles
  add constraint profiles_assigned_warehouse_fk
  foreign key (assigned_warehouse_code)
  references public.warehouses(code)
  on delete set null
  not valid;

create unique index if not exists warehouses_name_lower_unique_idx
  on public.warehouses (lower(btrim(name)));

-- Re-home workflow-test stock rows onto the canonical primary warehouse.
update public.warehouse_stock
set warehouse_code = 'IN-WEST-01',
    updated_at = now()
where warehouse_code = 'BUSINESS-WH';

update public.inventory_movements
set warehouse_code = 'IN-WEST-01'
where warehouse_code = 'BUSINESS-WH';

update public.shipments
set warehouse_id = 'IN-WEST-01'
where warehouse_id = 'BUSINESS-WH';

update public.orders
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{assigned_warehouse_code}',
  '"IN-WEST-01"'::jsonb,
  true
)
where metadata->>'assigned_warehouse_code' = 'BUSINESS-WH';

-- Remove orphan test warehouse entity.
delete from public.warehouses
where code = 'BUSINESS-WH';

-- Assign existing warehouse operators to the primary site when unset.
update public.profiles
set assigned_warehouse_code = 'IN-WEST-01',
    updated_at = now()
where default_role = 'warehouse'
  and assigned_warehouse_code is null;

alter table public.profiles validate constraint profiles_assigned_warehouse_fk;

comment on column public.profiles.assigned_warehouse_code is
  'Warehouse site code for warehouse-role operators. Admins remain null.';
