-- Supplier product workflow columns required by the supplier portal.

alter table public.mithron_products
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists supplier_id uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.mithron_products drop constraint if exists mithron_products_workflow_status_check;

alter table public.mithron_products
  add constraint mithron_products_workflow_status_check
  check (workflow_status in ('draft', 'pending_review', 'published', 'archived', 'rejected'));

create index if not exists mithron_products_supplier_idx
  on public.mithron_products (supplier_id, workflow_status, updated_at desc);

notify pgrst, 'reload schema';
