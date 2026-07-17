-- Production schema hardening: orphan role cleanup, order backfill, FK validation, indexes.

delete from public.roles r
where r.key in (
  'super_admin',
  'editor',
  'warehouse_manager',
  'warehouse_staff',
  'operations_manager',
  'staff',
  'reviewer',
  'support'
)
and not exists (select 1 from public.user_roles ur where ur.role_key = r.key)
and not exists (select 1 from public.role_permissions rp where rp.role_key = r.key)
and not exists (
  select 1
  from public.role_inheritance ri
  where ri.role_key = r.key
     or ri.inherited_role_key = r.key
);

update public.orders
set created_by_user_id = created_by
where created_by_user_id is null
  and created_by is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_product_slug_fk'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_product_slug_fk
      foreign key (product_slug)
      references public.mithron_products (slug)
      on delete cascade;
  end if;
end $$;

alter table public.notifications
  add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_created_by_user_id_idx
  on public.orders (created_by_user_id);

alter table public.inventory validate constraint inventory_sku_required_chk;
alter table public.inventory validate constraint inventory_variant_id_not_blank_chk;
alter table public.warehouse_stock validate constraint warehouse_stock_sku_required_chk;
alter table public.warehouse_stock validate constraint warehouse_stock_variant_id_not_blank_chk;
