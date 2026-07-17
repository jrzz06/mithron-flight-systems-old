alter table public.mithron_products
  add column if not exists inventory_init jsonb;

comment on column public.mithron_products.inventory_init is
  'Supplier-submitted initial inventory hints pending admin approval. Never creates stock until approval.';
