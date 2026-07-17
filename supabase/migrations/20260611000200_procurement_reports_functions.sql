-- Procurement reports aggregation functions

create or replace function public.report_sales_by_period(days_back integer default 30)
returns table (
  day date,
  order_count bigint,
  revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*)::bigint as order_count,
    coalesce(sum(total), 0)::numeric as revenue
  from public.orders
  where created_at >= now() - make_interval(days => greatest(days_back, 1))
  group by 1
  order by 1 desc;
$$;

create or replace function public.report_supplier_throughput()
returns table (
  supplier_id uuid,
  draft_count bigint,
  pending_count bigint,
  published_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    supplier_id,
    count(*) filter (where workflow_status = 'draft')::bigint,
    count(*) filter (where workflow_status = 'pending_review')::bigint,
    count(*) filter (where workflow_status = 'published')::bigint,
    count(*) filter (where workflow_status = 'rejected')::bigint
  from public.mithron_products
  where supplier_id is not null
  group by supplier_id;
$$;

create or replace function public.report_low_stock_summary()
returns table (
  product_slug text,
  quantity numeric,
  reorder_threshold numeric,
  stock_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    product_slug,
    quantity,
    reorder_threshold,
    stock_status
  from public.inventory
  where quantity <= reorder_threshold
  order by quantity asc
  limit 200;
$$;

create or replace function public.report_revenue_by_status()
returns table (
  status text,
  order_count bigint,
  revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    status,
    count(*)::bigint as order_count,
    coalesce(sum(total), 0)::numeric as revenue
  from public.orders
  group by status
  order by revenue desc;
$$;
