-- Supabase optimization pass: additive hot-path indexes only.
-- Behavior-preserving: no schema renames, no RLS changes, no data mutations.

create index if not exists orders_fulfillment_status_idx
  on public.orders (fulfillment_status, updated_at desc);

create index if not exists footer_links_column_sort_idx
  on public.footer_links (column_id, sort_order);

create index if not exists orders_updated_idx
  on public.orders (updated_at desc);
