-- Retire legacy supplier stock request flow and supplier inventory_init hints.
-- Admin inventory.quantity remains the single source of truth for stock levels.

drop table if exists public.supplier_stock_requests;

drop type if exists public.stock_request_status;

alter table public.mithron_products
  drop column if exists inventory_init;
