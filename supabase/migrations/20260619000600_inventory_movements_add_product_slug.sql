-- Add canonical product_slug column (mirrors legacy product_id which stores slugs).
-- Migration B (drop product_id) deferred until code deploy is validated.

alter table public.inventory_movements
  add column if not exists product_slug text
  generated always as (product_id) stored;

create index if not exists inventory_movements_product_slug_idx
  on public.inventory_movements(product_slug);
