-- RBAC v2: split customer checkout from warehouse order lifecycle; align DB role_permissions.

insert into public.permissions (key, label, description)
values
  ('orders.checkout', 'Checkout', 'Create own customer checkout orders'),
  ('orders.lifecycle', 'Order lifecycle', 'Warehouse and admin order fulfillment mutations'),
  ('account.read.self', 'Own account', 'Read and manage own customer account data')
on conflict (key) do nothing;

-- Customer role: checkout only (remove broad orders.write if present).
delete from public.role_permissions
where role_key = 'user' and permission_key = 'orders.write';

insert into public.role_permissions (role_key, permission_key)
values
  ('user', 'orders.checkout'),
  ('user', 'account.read.self'),
  ('warehouse', 'orders.lifecycle')
on conflict (role_key, permission_key) do nothing;

-- Admin inherits all permissions via super_admin / admin role grants in prior migrations.

-- Tighten orders write RLS: warehouse/admin lifecycle only (service role remains primary path).
drop policy if exists "orders operations write" on public.orders;

create policy "orders lifecycle write"
  on public.orders
  for all
  to authenticated
  using (
    public.has_any_cms_permission(array['orders.lifecycle', 'orders.write'])
    or (public.has_cms_permission('orders.checkout') and created_by_user_id = auth.uid())
  )
  with check (
    public.has_any_cms_permission(array['orders.lifecycle', 'orders.write'])
    or (public.has_cms_permission('orders.checkout') and created_by_user_id = auth.uid())
  );

drop policy if exists "order_items operations write" on public.order_items;

create policy "order_items lifecycle write"
  on public.order_items
  for all
  to authenticated
  using (
    public.has_any_cms_permission(array['orders.lifecycle', 'orders.write'])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = auth.uid()
        and public.has_cms_permission('orders.checkout')
    )
  )
  with check (
    public.has_any_cms_permission(array['orders.lifecycle', 'orders.write'])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = auth.uid()
        and public.has_cms_permission('orders.checkout')
    )
  );
