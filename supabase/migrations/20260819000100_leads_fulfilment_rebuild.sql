-- Enquiry-to-fulfilment rebuild:
-- 1) Unified leads table (replaces enquiries + contact_requests)
-- 2) Simplified fulfillment_status values
-- 3) Drop archive/cold-storage for leads/orders
-- 4) RLS handoff: admin mutates only while fulfillment is pending; warehouse after push

-- ---------------------------------------------------------------------------
-- Relax fulfillment trigger BEFORE remapping statuses (old guard rejects packing)
-- ---------------------------------------------------------------------------
drop trigger if exists orders_fulfillment_transition_guard on public.orders;

create or replace function public.normalize_order_fulfillment_status(status_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(nullif(status_value, ''), 'pending'))
    when 'queued' then 'pending'
    when 'draft' then 'pending'
    when 'processing' then 'packing'
    when 'picked' then 'packing'
    when 'packed' then 'packing'
    when 'ready_to_dispatch' then 'dispatched'
    when 'shipped' then 'dispatched'
    when 'in_transit' then 'dispatched'
    when 'fulfilled' then 'delivered'
    when 'completed' then 'delivered'
    else lower(coalesce(nullif(status_value, ''), 'pending'))
  end;
$$;

create or replace function public.enforce_order_fulfillment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_status text;
  next_status text;
  allowed_next text[];
begin
  next_status := public.normalize_order_fulfillment_status(new.fulfillment_status);

  if next_status not in (
    'pending',
    'packing',
    'dispatched',
    'delivered',
    'returned',
    'cancelled'
  ) then
    raise exception 'Invalid order fulfillment status: %', new.fulfillment_status
      using errcode = '23514';
  end if;

  new.fulfillment_status := next_status;

  if tg_op = 'INSERT' then
    return new;
  end if;

  previous_status := public.normalize_order_fulfillment_status(old.fulfillment_status);

  if previous_status = next_status then
    return new;
  end if;

  allowed_next := case previous_status
    when 'pending' then array['packing', 'cancelled']
    when 'packing' then array['dispatched', 'cancelled']
    when 'dispatched' then array['delivered', 'returned']
    when 'delivered' then array['returned']
    when 'returned' then array[]::text[]
    when 'cancelled' then array[]::text[]
    else array[]::text[]
  end;

  if not (next_status = any(allowed_next)) then
    raise exception 'Invalid order fulfillment transition % -> %.', previous_status, next_status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remap existing order fulfillment statuses (preserve financial records)
-- Trigger is dropped above so bulk remap can rewrite legacy values.
-- ---------------------------------------------------------------------------
update public.orders
set fulfillment_status = 'packing'
where coalesce(fulfillment_status, '') in ('processing', 'picked', 'packed');

update public.orders
set fulfillment_status = 'dispatched'
where coalesce(fulfillment_status, '') in ('ready_to_dispatch', 'shipped', 'in_transit');

create trigger orders_fulfillment_transition_guard
before insert or update of fulfillment_status on public.orders
for each row
execute function public.enforce_order_fulfillment_transition();

drop index if exists orders_warehouse_execution_queue_idx;
create index if not exists orders_warehouse_execution_queue_idx
  on public.orders (fulfillment_status, updated_at desc)
  where fulfillment_status in ('pending', 'packing');

-- ---------------------------------------------------------------------------
-- Drop old lead conversion RPCs and archive cron function
-- ---------------------------------------------------------------------------
drop function if exists public.convert_enquiry_to_order_atomic(uuid, uuid, jsonb, jsonb, text);
drop function if exists public.convert_contact_request_to_order(uuid, uuid);
drop function if exists public.link_contact_request_to_order(uuid, uuid, uuid);
drop function if exists public.archive_operational_data(integer, integer);

-- ---------------------------------------------------------------------------
-- Detach order FKs to old lead tables, then drop archives + live lead tables
-- ---------------------------------------------------------------------------
alter table if exists public.orders
  drop constraint if exists orders_source_enquiry_id_fkey;

alter table if exists public.orders
  drop constraint if exists orders_source_contact_request_id_fkey;

drop table if exists public.enquiries_archive cascade;
drop table if exists public.contact_requests_archive cascade;
drop table if exists public.orders_archive cascade;
drop table if exists public.order_items_archive cascade;

drop table if exists public.enquiries cascade;
drop table if exists public.contact_requests cascade;

drop type if exists public.enquiry_status;
drop type if exists public.contact_request_status;

-- ---------------------------------------------------------------------------
-- Unified leads table
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_number bigint generated always as identity,
  name text not null,
  phone text not null,
  email text not null,
  address text,
  product_slug text,
  product_name text,
  message text not null default '',
  source text not null
    check (source in ('contact_form', 'product_enquiry', 'checkout_enquiry')),
  status text not null default 'new'
    check (status in ('new', 'converted')),
  converted_order_id uuid references public.orders(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_source_created_idx on public.leads (source, created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_converted_order_idx on public.leads (converted_order_id);

alter table public.orders
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null;

create index if not exists orders_source_lead_idx on public.orders (source_lead_id);

-- ---------------------------------------------------------------------------
-- convert_lead_to_order RPC
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead_to_order(
  p_lead_id uuid,
  p_actor_id uuid,
  p_address text default null,
  p_product_slug text default null,
  p_product_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_now timestamptz := now();
  v_address text;
  v_product_slug text;
  v_product_name text;
  v_has_address boolean;
  v_has_product boolean;
  v_metadata jsonb;
  v_timeline jsonb;
  v_unit_price numeric(12, 2) := 0;
begin
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'lead_not_found');
  end if;

  if v_lead.status = 'converted' and v_lead.converted_order_id is not null then
    select * into v_order from public.orders where id = v_lead.converted_order_id;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_lead.converted_order_id,
      'order_number', v_order.order_number,
      'status', v_order.status
    );
  end if;

  v_address := nullif(btrim(coalesce(p_address, v_lead.address, '')), '');
  v_product_slug := nullif(btrim(coalesce(p_product_slug, v_lead.product_slug, '')), '');
  v_product_name := nullif(btrim(coalesce(p_product_name, v_lead.product_name, '')), '');
  v_has_address := v_address is not null;
  v_has_product := v_product_slug is not null;

  if v_has_product then
    select coalesce(price, 0) into v_unit_price
    from public.mithron_products
    where slug = v_product_slug;
    v_unit_price := coalesce(v_unit_price, 0);
  end if;

  v_order_number := 'ORD-' || to_char(v_now at time zone 'utc', 'YYYYMMDD')
    || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  v_metadata := jsonb_build_object(
    'source', 'lead',
    'source_lead_id', p_lead_id::text,
    'lead_source', v_lead.source,
    'customer_full_name', v_lead.name,
    'customer_phone', v_lead.phone,
    'original_message', v_lead.message,
    'converted_from_lead_at', v_now,
    'needs_address', not v_has_address,
    'needs_products', not v_has_product
  );

  if v_has_address then
    v_metadata := v_metadata || jsonb_build_object(
      'shipping_address', jsonb_build_object('line1', v_address)
    );
  end if;

  v_timeline := jsonb_build_array(
    jsonb_build_object(
      'at', v_now,
      'status', 'confirmed',
      'event', 'order.created',
      'note', 'Order created from lead.',
      'actor_id', p_actor_id,
      'metadata', jsonb_build_object('source', 'lead')
    )
  );

  insert into public.orders (
    order_number,
    customer_email,
    status,
    payment_status,
    fulfillment_status,
    channel,
    subtotal,
    total,
    currency,
    items,
    metadata,
    timeline,
    created_by,
    created_by_user_id,
    source_lead_id,
    updated_at
  )
  values (
    v_order_number,
    v_lead.email,
    'confirmed',
    'not_required',
    'pending',
    'enquiry',
    case when v_has_product then v_unit_price else 0 end,
    case when v_has_product then v_unit_price else 0 end,
    'INR',
    '[]'::jsonb,
    v_metadata,
    v_timeline,
    p_actor_id,
    v_lead.customer_user_id,
    p_lead_id,
    v_now
  )
  returning * into v_order;

  v_order_id := v_order.id;

  if v_has_product then
    insert into public.order_items (
      order_id,
      product_slug,
      product_name,
      quantity,
      unit_price,
      line_total,
      metadata
    )
    values (
      v_order_id,
      v_product_slug,
      coalesce(v_product_name, v_product_slug),
      1,
      v_unit_price,
      v_unit_price,
      jsonb_build_object('source', 'lead')
    );
  end if;

  update public.leads
  set
    status = 'converted',
    converted_order_id = v_order_id,
    address = coalesce(v_address, address),
    product_slug = coalesce(v_product_slug, product_slug),
    product_name = coalesce(v_product_name, product_name),
    updated_at = v_now
  where id = p_lead_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'row', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.convert_lead_to_order(uuid, uuid, text, text, text) from public;
grant execute on function public.convert_lead_to_order(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- leads RLS
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

drop policy if exists "leads public insert" on public.leads;
create policy "leads public insert" on public.leads
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "leads staff select" on public.leads;
create policy "leads staff select" on public.leads
  for select
  to authenticated
  using (
    has_cms_permission('enquiries.write'::text)
    or has_cms_permission('orders.write'::text)
  );

drop policy if exists "leads staff update" on public.leads;
create policy "leads staff update" on public.leads
  for update
  to authenticated
  using (has_cms_permission('enquiries.write'::text))
  with check (has_cms_permission('enquiries.write'::text));

drop policy if exists "leads staff delete" on public.leads;
create policy "leads staff delete" on public.leads
  for delete
  to authenticated
  using (has_cms_permission('enquiries.write'::text));

-- ---------------------------------------------------------------------------
-- Order mutation RLS handoff boundary
-- Admin (orders.write / orders.lifecycle without warehouse.write): mutate only while pending
-- Warehouse (warehouse.write): mutate once packing/dispatched/delivered
-- ---------------------------------------------------------------------------
drop policy if exists "orders lifecycle write update" on public.orders;
create policy "orders lifecycle write update" on public.orders
  for update
  to authenticated
  using (
    (
      has_cms_permission('warehouse.write'::text)
      and coalesce(fulfillment_status, 'pending') in ('packing', 'dispatched', 'delivered')
    )
    or (
      has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
      and coalesce(fulfillment_status, 'pending') = 'pending'
    )
  )
  with check (
    (
      has_cms_permission('warehouse.write'::text)
      and coalesce(fulfillment_status, 'pending') in ('pending', 'packing', 'dispatched', 'delivered')
    )
    or (
      has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
      and coalesce(fulfillment_status, 'pending') in ('pending', 'packing')
    )
  );

drop policy if exists "orders lifecycle write delete" on public.orders;
create policy "orders lifecycle write delete" on public.orders
  for delete
  to authenticated
  using (
    (
      has_cms_permission('warehouse.write'::text)
      and coalesce(fulfillment_status, 'pending') in ('packing', 'dispatched', 'delivered')
    )
    or (
      has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
      and coalesce(fulfillment_status, 'pending') = 'pending'
    )
  );

drop policy if exists "order_items lifecycle write update" on public.order_items;
create policy "order_items lifecycle write update" on public.order_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (
          (
            has_cms_permission('warehouse.write'::text)
            and coalesce(o.fulfillment_status, 'pending') in ('packing', 'dispatched', 'delivered')
          )
          or (
            has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
            and coalesce(o.fulfillment_status, 'pending') = 'pending'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (
          has_cms_permission('warehouse.write'::text)
          or (
            has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
            and coalesce(o.fulfillment_status, 'pending') in ('pending', 'packing')
          )
        )
    )
  );

drop policy if exists "order_items lifecycle write delete" on public.order_items;
create policy "order_items lifecycle write delete" on public.order_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (
          (
            has_cms_permission('warehouse.write'::text)
            and coalesce(o.fulfillment_status, 'pending') in ('packing', 'dispatched', 'delivered')
          )
          or (
            has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
            and coalesce(o.fulfillment_status, 'pending') = 'pending'
          )
        )
    )
  );

drop policy if exists "order_items lifecycle write" on public.order_items;
create policy "order_items lifecycle write" on public.order_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (
          has_cms_permission('warehouse.write'::text)
          or (
            has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])
            and coalesce(o.fulfillment_status, 'pending') = 'pending'
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Refresh warehouse eligible view for simplified fulfillment
-- ---------------------------------------------------------------------------
create or replace view public.warehouse_eligible_orders as
select o.*
from public.orders o
where o.deleted_at is null
  and coalesce(o.payment_status, '') in ('succeeded', 'not_required')
  and (
    o.status in ('assigned', 'processing', 'packed', 'dispatched', 'in_transit', 'delivered')
    or coalesce(o.fulfillment_status, 'pending') in ('packing', 'dispatched', 'delivered')
  );
