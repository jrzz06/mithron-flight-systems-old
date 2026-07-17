-- Lock customer order writes: remove orders.checkout from authenticated
-- INSERT/UPDATE/DELETE policies on orders and order_items.
--
-- Checkout creation uses service_role RPC create_checkout_order.
-- Staff lifecycle mutations use orders.lifecycle / orders.write.
-- Customers retain SELECT of their own orders via "orders select combined".
-- Application permission orders.checkout is unchanged (API-layer checks).

-- ---------------------------------------------------------------------------
-- orders: staff-only writes
-- ---------------------------------------------------------------------------
drop policy if exists "orders lifecycle write" on public.orders;
drop policy if exists "orders lifecycle write update" on public.orders;
drop policy if exists "orders lifecycle write delete" on public.orders;

create policy "orders lifecycle write" on public.orders
  for insert to authenticated
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );

create policy "orders lifecycle write update" on public.orders
  for update to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  )
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );

create policy "orders lifecycle write delete" on public.orders
  for delete to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );

-- ---------------------------------------------------------------------------
-- order_items: staff-only writes
-- ---------------------------------------------------------------------------
drop policy if exists "order_items lifecycle write" on public.order_items;
drop policy if exists "order_items lifecycle write update" on public.order_items;
drop policy if exists "order_items lifecycle write delete" on public.order_items;

create policy "order_items lifecycle write" on public.order_items
  for insert to authenticated
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );

create policy "order_items lifecycle write update" on public.order_items
  for update to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  )
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );

create policy "order_items lifecycle write delete" on public.order_items
  for delete to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
  );
