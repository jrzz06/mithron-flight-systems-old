-- Security fixes migration
-- C1: Remove enquiries.write from user role; scope admin policies to INSERT/UPDATE/DELETE only
-- C2: Enable RLS on editor_document_media
-- M1: Add supplier ownership check to inventory INSERT policy

-- ============================================================
-- C1a: Remove enquiries.write from user role
-- Customers should never have the write permission that the
-- admin FOR ALL policy also uses — this conflation granted
-- customers full SELECT/UPDATE/DELETE on all enquiry rows.
-- ============================================================
delete from public.role_permissions
where role_key = 'user' and permission_key = 'enquiries.write';

-- ============================================================
-- C1b: Replace FOR ALL admin enquiry policy with scoped ones
-- The old FOR ALL included SELECT, but "enquiries admin read"
-- already covers admin reads. Narrow to INSERT/UPDATE/DELETE.
-- ============================================================
drop policy if exists "enquiries admin write" on public.enquiries;

create policy "enquiries admin insert" on public.enquiries
for insert to authenticated
with check (public.has_cms_permission('enquiries.write'));

create policy "enquiries admin update" on public.enquiries
for update to authenticated
using (public.has_cms_permission('enquiries.write'))
with check (public.has_cms_permission('enquiries.write'));

create policy "enquiries admin delete" on public.enquiries
for delete to authenticated
using (public.has_cms_permission('enquiries.write'));

-- ============================================================
-- C1c: Replace FOR ALL admin contact_requests policy too
-- Same issue: FOR ALL let customers with enquiries.write
-- perform SELECT on all contact_requests rows.
-- ============================================================
drop policy if exists "contact_requests admin write" on public.contact_requests;

create policy "contact_requests admin insert" on public.contact_requests
for insert to authenticated
with check (public.has_cms_permission('enquiries.write'));

create policy "contact_requests admin update" on public.contact_requests
for update to authenticated
using (public.has_cms_permission('enquiries.write'))
with check (public.has_cms_permission('enquiries.write'));

create policy "contact_requests admin delete" on public.contact_requests
for delete to authenticated
using (public.has_cms_permission('enquiries.write'));

-- ============================================================
-- C2: Enable RLS on editor_document_media and lock it down
-- The table was created without RLS, allowing any
-- authenticated caller to read/write it via REST.
-- ============================================================
alter table if exists public.editor_document_media
  enable row level security;

drop policy if exists "editor_document_media service role manage" on public.editor_document_media;
create policy "editor_document_media service role manage" on public.editor_document_media
for all to service_role using (true) with check (true);

drop policy if exists "editor_document_media admin manage" on public.editor_document_media;
create policy "editor_document_media admin manage" on public.editor_document_media
for all to authenticated
using (public.has_cms_permission('media.write'))
with check (public.has_cms_permission('media.write'));

-- ============================================================
-- M1: Add supplier ownership check to inventory INSERT policy
-- Without this, any supplier could INSERT inventory rows for
-- any product_slug, including competitors' products.
-- ============================================================
drop policy if exists "inventory supplier catalog write" on public.inventory;

create policy "inventory supplier catalog write" on public.inventory
for insert to authenticated
with check (
  (
    public.has_cms_permission('products.submit')
    and exists (
      select 1 from public.mithron_products p
      where p.slug = inventory.product_slug
        and p.supplier_id = auth.uid()
    )
  )
  or public.has_cms_permission('inventory.update_own')
);
