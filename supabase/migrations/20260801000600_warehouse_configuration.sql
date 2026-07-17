-- Global warehouse operational configuration (replaces hardcoded defaults).

create table if not exists public.warehouse_configuration (
  id text primary key default 'global',
  default_warehouse_code text,
  checkout_warehouse_code text,
  supplier_intake_warehouse_code text,
  auto_reserve_on_allocate boolean not null default true,
  default_carrier text,
  barcode_prefix text,
  printer_name text,
  label_width_mm integer not null default 100,
  require_item_scan boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint warehouse_configuration_id_chk check (id = 'global'),
  constraint warehouse_configuration_label_width_chk check (label_width_mm > 0)
);

alter table public.warehouse_configuration
  drop constraint if exists warehouse_configuration_default_fk;

alter table public.warehouse_configuration
  add constraint warehouse_configuration_default_fk
  foreign key (default_warehouse_code) references public.warehouses(code) on delete set null not valid;

alter table public.warehouse_configuration
  drop constraint if exists warehouse_configuration_checkout_fk;

alter table public.warehouse_configuration
  add constraint warehouse_configuration_checkout_fk
  foreign key (checkout_warehouse_code) references public.warehouses(code) on delete set null not valid;

alter table public.warehouse_configuration
  drop constraint if exists warehouse_configuration_supplier_fk;

alter table public.warehouse_configuration
  add constraint warehouse_configuration_supplier_fk
  foreign key (supplier_intake_warehouse_code) references public.warehouses(code) on delete set null not valid;

insert into public.warehouse_configuration (
  id,
  default_warehouse_code,
  checkout_warehouse_code,
  supplier_intake_warehouse_code,
  auto_reserve_on_allocate,
  default_carrier,
  barcode_prefix
)
select
  'global',
  w.code,
  w.code,
  w.code,
  true,
  'Mithron Field',
  'MTH-'
from public.warehouses w
where w.is_active = true
order by w.code asc
limit 1
on conflict (id) do nothing;

alter table public.warehouse_configuration validate constraint warehouse_configuration_default_fk;
alter table public.warehouse_configuration validate constraint warehouse_configuration_checkout_fk;
alter table public.warehouse_configuration validate constraint warehouse_configuration_supplier_fk;

alter table public.warehouse_configuration enable row level security;

drop policy if exists warehouse_configuration_read on public.warehouse_configuration;
create policy warehouse_configuration_read on public.warehouse_configuration
for select to authenticated
using (
  public.has_cms_permission('warehouse.read')
  or public.has_cms_permission('warehouse.write')
  or public.has_cms_permission('settings.write')
);

drop policy if exists warehouse_configuration_manage on public.warehouse_configuration;
create policy warehouse_configuration_manage on public.warehouse_configuration
for all to authenticated
using (public.has_cms_permission('settings.write'))
with check (public.has_cms_permission('settings.write'));

drop policy if exists warehouse_configuration_service_role on public.warehouse_configuration;
create policy warehouse_configuration_service_role on public.warehouse_configuration
for all to service_role
using (true)
with check (true);
