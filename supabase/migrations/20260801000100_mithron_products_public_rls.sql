-- Restrict public catalog reads to published, visible products only.
drop policy if exists "mithron products are publicly readable" on public.mithron_products;

create policy "mithron products are publicly readable"
  on public.mithron_products
  for select
  to anon, authenticated
  using (workflow_status = 'published' and is_visible = true);

-- Suppliers can read their own products regardless of workflow status.
drop policy if exists "suppliers read own products" on public.mithron_products;
create policy "suppliers read own products"
  on public.mithron_products
  for select
  to authenticated
  using (supplier_id = auth.uid());
