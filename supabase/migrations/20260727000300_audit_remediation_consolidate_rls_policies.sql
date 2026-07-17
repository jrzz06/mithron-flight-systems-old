-- Audit remediation: consolidate multiple permissive RLS policies (safe rewrite).
-- Semantics preserved via OR merges or dropping redundant identical SELECT policies.
-- Service-role policies are left untouched.

-- ---------------------------------------------------------------------------
-- Pattern A: redundant SELECT when ALL already covers the same USING qual
-- ---------------------------------------------------------------------------
drop policy if exists "admin_invites settings read" on public.admin_invites;
drop policy if exists "admin_settings settings read" on public.admin_settings;
drop policy if exists "customer addresses self read" on public.customer_addresses;
drop policy if exists "customer carts self read" on public.customer_carts;
drop policy if exists "deployment_requests operations read" on public.deployment_requests;
drop policy if exists "product_media_assets admin read" on public.product_media_assets;
drop policy if exists "staff_tasks operations read" on public.staff_tasks;

-- ---------------------------------------------------------------------------
-- Pattern B: CMS publishables — ALL(authenticated) + SELECT(public)
-- Split ALL into I/U/D, combined SELECT for authenticated, published SELECT for anon
-- ---------------------------------------------------------------------------
do $body$
declare
  t text;
  tables text[] := array[
    'category_metadata','cms_pages','cms_sections','faqs','footer_columns','footer_links',
    'hero_banners','homepage_ordering','press_coverage','product_reviews',
    'promotional_campaigns','section_visibility','site_navigation','trust_cards'
  ];
  pub_qual text;
  admin_qual text := $q$has_cms_permission('cms.write'::text)$q$;
begin
  foreach t in array tables loop
    -- Resolve published-read USING from existing policy when present
    select qual into pub_qual
    from pg_policies
    where schemaname = 'public' and tablename = t and policyname = t || ' public published read';

    if pub_qual is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || ' admin write', t);
    execute format('drop policy if exists %I on public.%I', t || ' admin write update', t);
    execute format('drop policy if exists %I on public.%I', t || ' admin write delete', t);
    execute format('drop policy if exists %I on public.%I', t || ' select combined', t);
    execute format('drop policy if exists %I on public.%I', t || ' public published read', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((%s) or (%s))',
      t || ' select combined', t, admin_qual, pub_qual
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      t || ' admin write', t, admin_qual
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || ' admin write update', t, admin_qual, admin_qual
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      t || ' admin write delete', t, admin_qual
    );
    execute format(
      'create policy %I on public.%I for select to anon using (%s)',
      t || ' public published read', t, pub_qual
    );
  end loop;
end $body$;

-- media_assets uses a broader admin write qual
do $body$
declare
  admin_qual text := $q$(has_cms_permission('media.write'::text) or has_cms_permission('cms.write'::text))$q$;
  pub_qual text;
begin
  select qual into pub_qual from pg_policies
  where schemaname='public' and tablename='media_assets' and policyname='media_assets public published read';
  if pub_qual is null then return; end if;

  drop policy if exists "media_assets admin write" on public.media_assets;
  drop policy if exists "media_assets admin write update" on public.media_assets;
  drop policy if exists "media_assets admin write delete" on public.media_assets;
  drop policy if exists "media_assets select combined" on public.media_assets;
  drop policy if exists "media_assets public published read" on public.media_assets;

  execute format(
    'create policy %I on public.media_assets for select to authenticated using ((%s) or (%s))',
    'media_assets select combined', admin_qual, pub_qual
  );
  execute format(
    'create policy %I on public.media_assets for insert to authenticated with check (%s)',
    'media_assets admin write', admin_qual
  );
  execute format(
    'create policy %I on public.media_assets for update to authenticated using (%s) with check (%s)',
    'media_assets admin write update', admin_qual, admin_qual
  );
  execute format(
    'create policy %I on public.media_assets for delete to authenticated using (%s)',
    'media_assets admin write delete', admin_qual
  );
  execute format(
    'create policy %I on public.media_assets for select to anon using (%s)',
    'media_assets public published read', pub_qual
  );
end $body$;

-- ---------------------------------------------------------------------------
-- Pattern C: two SELECT policies → one combined SELECT (same roles)
-- ---------------------------------------------------------------------------
drop policy if exists "contact_requests admin read" on public.contact_requests;
drop policy if exists "contact_requests customer read own" on public.contact_requests;
drop policy if exists "contact_requests select combined" on public.contact_requests;
create policy "contact_requests select combined" on public.contact_requests
  for select to authenticated
  using (
    has_cms_permission('enquiries.read'::text)
    or (customer_user_id = (select auth.uid()))
  );

drop policy if exists "enquiries admin read" on public.enquiries;
drop policy if exists "enquiries customer read own" on public.enquiries;
drop policy if exists "enquiries select combined" on public.enquiries;
create policy "enquiries select combined" on public.enquiries
  for select to authenticated
  using (
    has_cms_permission('enquiries.read'::text)
    or (customer_user_id = (select auth.uid()))
  );

drop policy if exists "enquiries admin insert" on public.enquiries;
drop policy if exists "enquiries customer insert own" on public.enquiries;
drop policy if exists "enquiries insert combined" on public.enquiries;
create policy "enquiries insert combined" on public.enquiries
  for insert to authenticated
  with check (
    has_cms_permission('enquiries.write'::text)
    or (customer_user_id = (select auth.uid()) or customer_user_id is null)
  );

drop policy if exists "payments customer read own order" on public.payments;
drop policy if exists "payments ops read" on public.payments;
drop policy if exists "payments select combined" on public.payments;
create policy "payments select combined" on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and o.created_by_user_id = (select auth.uid())
    )
    or has_cms_permission('payments.write'::text)
    or has_cms_permission('orders.write'::text)
  );

-- mithron_products: single public SELECT covering published OR supplier-owned
drop policy if exists "mithron products are publicly readable" on public.mithron_products;
drop policy if exists "suppliers read own products" on public.mithron_products;
drop policy if exists "mithron_products select combined" on public.mithron_products;
create policy "mithron_products select combined" on public.mithron_products
  for select to public
  using (
    (workflow_status = 'published'::text and is_visible = true)
    or (supplier_id = (select auth.uid()))
  );

-- customer_order_reviews: single public SELECT covering owner OR published
drop policy if exists "customer_order_reviews_owner_read" on public.customer_order_reviews;
drop policy if exists "customer_order_reviews_public_read" on public.customer_order_reviews;
drop policy if exists "customer_order_reviews select combined" on public.customer_order_reviews;
create policy "customer_order_reviews select combined" on public.customer_order_reviews
  for select to public
  using (
    (user_id = (select auth.uid()))
    or (status = 'published'::customer_review_status)
  );

-- ---------------------------------------------------------------------------
-- Pattern D: ALL(authenticated) + SELECT(authenticated) with different quals
-- Split ALL → I/U/D; combined SELECT
-- ---------------------------------------------------------------------------

-- notifications
drop policy if exists "notifications admin write" on public.notifications;
drop policy if exists "notifications recipient read" on public.notifications;
drop policy if exists "notifications select combined" on public.notifications;
create policy "notifications select combined" on public.notifications
  for select to authenticated
  using (
    has_cms_permission('notifications.write'::text)
    or recipient_id = (select auth.uid())
    or has_any_cms_permission(array['notifications.write'::text, 'audit.read'::text])
  );
drop policy if exists "notifications admin write" on public.notifications;
create policy "notifications admin write" on public.notifications
  for insert to authenticated
  with check (has_cms_permission('notifications.write'::text));
drop policy if exists "notifications admin write update" on public.notifications;
create policy "notifications admin write update" on public.notifications
  for update to authenticated
  using (has_cms_permission('notifications.write'::text))
  with check (has_cms_permission('notifications.write'::text));
drop policy if exists "notifications admin write delete" on public.notifications;
create policy "notifications admin write delete" on public.notifications
  for delete to authenticated
  using (has_cms_permission('notifications.write'::text));

-- shipments
drop policy if exists "shipments warehouse write" on public.shipments;
drop policy if exists "shipments warehouse read" on public.shipments;
drop policy if exists "shipments select combined" on public.shipments;
create policy "shipments select combined" on public.shipments
  for select to authenticated
  using (
    has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text])
    or has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text, 'operations.write'::text, 'audit.read'::text])
  );
drop policy if exists "shipments warehouse write" on public.shipments;
create policy "shipments warehouse write" on public.shipments
  for insert to authenticated
  with check (has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text]));
drop policy if exists "shipments warehouse write update" on public.shipments;
create policy "shipments warehouse write update" on public.shipments
  for update to authenticated
  using (has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text]))
  with check (has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text]));
drop policy if exists "shipments warehouse write delete" on public.shipments;
create policy "shipments warehouse write delete" on public.shipments
  for delete to authenticated
  using (has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text]));

-- warehouse_configuration
drop policy if exists "warehouse_configuration_manage" on public.warehouse_configuration;
drop policy if exists "warehouse_configuration_read" on public.warehouse_configuration;
drop policy if exists "warehouse_configuration select combined" on public.warehouse_configuration;
create policy "warehouse_configuration select combined" on public.warehouse_configuration
  for select to authenticated
  using (
    has_cms_permission('settings.write'::text)
    or has_cms_permission('warehouse.read'::text)
    or has_cms_permission('warehouse.write'::text)
  );
drop policy if exists "warehouse_configuration_manage" on public.warehouse_configuration;
create policy "warehouse_configuration_manage" on public.warehouse_configuration
  for insert to authenticated
  with check (has_cms_permission('settings.write'::text));
drop policy if exists "warehouse_configuration_manage update" on public.warehouse_configuration;
create policy "warehouse_configuration_manage update" on public.warehouse_configuration
  for update to authenticated
  using (has_cms_permission('settings.write'::text))
  with check (has_cms_permission('settings.write'::text));
drop policy if exists "warehouse_configuration_manage delete" on public.warehouse_configuration;
create policy "warehouse_configuration_manage delete" on public.warehouse_configuration
  for delete to authenticated
  using (has_cms_permission('settings.write'::text));

-- warehouses
drop policy if exists "warehouses_manage" on public.warehouses;
drop policy if exists "warehouses_read_active" on public.warehouses;
drop policy if exists "warehouses select combined" on public.warehouses;
create policy "warehouses select combined" on public.warehouses
  for select to authenticated
  using (
    has_cms_permission('settings.write'::text)
    or is_active = true
    or has_cms_permission('warehouse.write'::text)
  );
drop policy if exists "warehouses_manage" on public.warehouses;
create policy "warehouses_manage" on public.warehouses
  for insert to authenticated
  with check (has_cms_permission('settings.write'::text));
drop policy if exists "warehouses_manage update" on public.warehouses;
create policy "warehouses_manage update" on public.warehouses
  for update to authenticated
  using (has_cms_permission('settings.write'::text))
  with check (has_cms_permission('settings.write'::text));
drop policy if exists "warehouses_manage delete" on public.warehouses;
create policy "warehouses_manage delete" on public.warehouses
  for delete to authenticated
  using (has_cms_permission('settings.write'::text));

-- warehouse_stock
drop policy if exists "warehouse_stock warehouse write" on public.warehouse_stock;
drop policy if exists "warehouse_stock operational read" on public.warehouse_stock;
drop policy if exists "warehouse_stock select combined" on public.warehouse_stock;
create policy "warehouse_stock select combined" on public.warehouse_stock
  for select to authenticated
  using (
    has_cms_permission('warehouse.write'::text)
    or has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text, 'audit.read'::text])
  );
drop policy if exists "warehouse_stock warehouse write" on public.warehouse_stock;
create policy "warehouse_stock warehouse write" on public.warehouse_stock
  for insert to authenticated
  with check (has_cms_permission('warehouse.write'::text));
drop policy if exists "warehouse_stock warehouse write update" on public.warehouse_stock;
create policy "warehouse_stock warehouse write update" on public.warehouse_stock
  for update to authenticated
  using (has_cms_permission('warehouse.write'::text))
  with check (has_cms_permission('warehouse.write'::text));
drop policy if exists "warehouse_stock warehouse write delete" on public.warehouse_stock;
create policy "warehouse_stock warehouse write delete" on public.warehouse_stock
  for delete to authenticated
  using (has_cms_permission('warehouse.write'::text));

-- inventory: merge SELECT quals; merge INSERT (supplier + warehouse); keep warehouse U/D
drop policy if exists "inventory warehouse write" on public.inventory;
drop policy if exists "inventory operational read" on public.inventory;
drop policy if exists "inventory supplier catalog write" on public.inventory;
drop policy if exists "inventory select combined" on public.inventory;
create policy "inventory select combined" on public.inventory
  for select to authenticated
  using (
    has_cms_permission('warehouse.write'::text)
    or has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text, 'audit.read'::text])
  );
drop policy if exists "inventory insert combined" on public.inventory;
create policy "inventory insert combined" on public.inventory
  for insert to authenticated
  with check (
    has_cms_permission('warehouse.write'::text)
    or (
      has_cms_permission('products.submit'::text)
      and exists (
        select 1 from public.mithron_products p
        where p.slug = inventory.product_slug
          and p.supplier_id = (select auth.uid())
      )
    )
    or has_cms_permission('inventory.update_own'::text)
  );
drop policy if exists "inventory warehouse write update" on public.inventory;
create policy "inventory warehouse write update" on public.inventory
  for update to authenticated
  using (has_cms_permission('warehouse.write'::text))
  with check (has_cms_permission('warehouse.write'::text));
drop policy if exists "inventory warehouse write delete" on public.inventory;
create policy "inventory warehouse write delete" on public.inventory
  for delete to authenticated
  using (has_cms_permission('warehouse.write'::text));

-- ---------------------------------------------------------------------------
-- orders / order_items: 3-way SELECT overlap + lifecycle ALL
-- ---------------------------------------------------------------------------
drop policy if exists "orders customer read own" on public.orders;
drop policy if exists "orders lifecycle write" on public.orders;
drop policy if exists "orders operations read" on public.orders;
drop policy if exists "orders select combined" on public.orders;
create policy "orders select combined" on public.orders
  for select to authenticated
  using (
    created_by_user_id = (select auth.uid())
    or has_any_cms_permission(array['warehouse.write'::text, 'orders.write'::text, 'operations.write'::text])
    or has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or (has_cms_permission('orders.checkout'::text) and created_by_user_id = (select auth.uid()))
  );
drop policy if exists "orders lifecycle write" on public.orders;
create policy "orders lifecycle write" on public.orders
  for insert to authenticated
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or (has_cms_permission('orders.checkout'::text) and created_by_user_id = (select auth.uid()))
  );
drop policy if exists "orders lifecycle write update" on public.orders;
create policy "orders lifecycle write update" on public.orders
  for update to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or (has_cms_permission('orders.checkout'::text) and created_by_user_id = (select auth.uid()))
  )
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or (has_cms_permission('orders.checkout'::text) and created_by_user_id = (select auth.uid()))
  );
drop policy if exists "orders lifecycle write delete" on public.orders;
create policy "orders lifecycle write delete" on public.orders
  for delete to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or (has_cms_permission('orders.checkout'::text) and created_by_user_id = (select auth.uid()))
  );

drop policy if exists "order items customer read own" on public.order_items;
drop policy if exists "order_items lifecycle write" on public.order_items;
drop policy if exists "order_items operations read" on public.order_items;
drop policy if exists "order_items select combined" on public.order_items;
create policy "order_items select combined" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
    )
    or has_cms_permission('orders.write'::text)
    or has_cms_permission('warehouse.write'::text)
    or has_cms_permission('operations.write'::text)
    or has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
        and has_cms_permission('orders.checkout'::text)
    )
  );
drop policy if exists "order_items lifecycle write" on public.order_items;
create policy "order_items lifecycle write" on public.order_items
  for insert to authenticated
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
        and has_cms_permission('orders.checkout'::text)
    )
  );
drop policy if exists "order_items lifecycle write update" on public.order_items;
create policy "order_items lifecycle write update" on public.order_items
  for update to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
        and has_cms_permission('orders.checkout'::text)
    )
  )
  with check (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
        and has_cms_permission('orders.checkout'::text)
    )
  );
drop policy if exists "order_items lifecycle write delete" on public.order_items;
create policy "order_items lifecycle write delete" on public.order_items
  for delete to authenticated
  using (
    has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_by_user_id = (select auth.uid())
        and has_cms_permission('orders.checkout'::text)
    )
  );

-- Remaining FK covering indexes from advisor
create index if not exists faqs_product_slug_idx on public.faqs (product_slug);
create index if not exists role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index if not exists shipment_items_product_id_idx on public.shipment_items (product_id);
