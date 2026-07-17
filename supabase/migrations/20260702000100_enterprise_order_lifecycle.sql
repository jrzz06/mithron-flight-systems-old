-- Enterprise order lifecycle: soft-delete, contact_requests, enquiry_kind, conversion RPCs.

do $$
begin
  create type public.contact_request_status as enum (
    'new', 'contacted', 'qualified', 'converted', 'rejected', 'archived'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists source_enquiry_id uuid references public.enquiries(id) on delete set null,
  add column if not exists source_contact_request_id uuid;

create index if not exists orders_deleted_at_idx on public.orders (deleted_at);
create index if not exists orders_archived_at_idx on public.orders (archived_at);
create index if not exists orders_source_enquiry_idx on public.orders (source_enquiry_id);

alter table public.enquiries
  add column if not exists enquiry_kind text not null default 'product',
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.enquiries drop constraint if exists enquiries_enquiry_kind_chk;
alter table public.enquiries
  add constraint enquiries_enquiry_kind_chk
  check (enquiry_kind in ('product', 'checkout'));

create index if not exists enquiries_kind_status_idx
  on public.enquiries (enquiry_kind, status, created_at desc);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  customer_phone text,
  customer_full_name text,
  customer_company text,
  subject text not null,
  body text not null,
  region text,
  status public.contact_request_status not null default 'new',
  assigned_to uuid references auth.users(id) on delete set null,
  converted_order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_requests_status_idx
  on public.contact_requests (status, created_at desc);
create index if not exists contact_requests_customer_idx
  on public.contact_requests (customer_user_id, created_at desc);

alter table public.orders
  drop constraint if exists orders_source_contact_request_fk;
alter table public.orders
  add constraint orders_source_contact_request_fk
  foreign key (source_contact_request_id)
  references public.contact_requests(id)
  on delete set null;

update public.orders o
set source_enquiry_id = (o.metadata->>'source_enquiry_id')::uuid
where o.source_enquiry_id is null
  and coalesce(o.metadata->>'source_enquiry_id', '') ~* '^[0-9a-f-]{36}$';

insert into public.contact_requests (
  id, customer_user_id, customer_email, customer_phone, customer_full_name,
  customer_company, subject, body, region, status, assigned_to, converted_order_id,
  payload, created_at, updated_at
)
select
  e.id, e.customer_user_id, e.customer_email,
  nullif(trim(coalesce(e.payload->>'customer_phone', '')), ''),
  nullif(trim(coalesce(e.payload->>'customer_full_name', '')), ''),
  nullif(trim(coalesce(e.payload->>'customer_company', '')), ''),
  e.subject, e.body, e.region,
  case e.status::text
    when 'new' then 'new'::public.contact_request_status
    when 'contacted' then 'contacted'::public.contact_request_status
    when 'qualified' then 'qualified'::public.contact_request_status
    when 'won' then 'converted'::public.contact_request_status
    when 'lost' then 'rejected'::public.contact_request_status
    when 'converted' then 'converted'::public.contact_request_status
    else 'new'::public.contact_request_status
  end,
  e.assigned_to, e.converted_order_id,
  jsonb_build_object(
    'legacy_enquiry_id', e.id::text,
    'timeline', coalesce(e.payload->'timeline', '[]'::jsonb),
    'notes', coalesce(e.payload->'notes', '[]'::jsonb),
    'source', 'contact'
  ),
  e.created_at, e.updated_at
from public.enquiries e
where coalesce(e.payload->>'source', '') = 'contact'
on conflict (id) do nothing;

update public.enquiries e
set archived_at = coalesce(e.archived_at, now()),
    deleted_at = coalesce(e.deleted_at, now()),
    updated_at = now()
where coalesce(e.payload->>'source', '') = 'contact'
  and exists (select 1 from public.contact_requests cr where cr.id = e.id);

update public.enquiries e
set enquiry_kind = 'checkout'
where coalesce(e.payload->>'source', '') = 'checkout'
  and e.enquiry_kind = 'product';

create or replace view public.warehouse_eligible_orders as
select o.*
from public.orders o
where o.deleted_at is null
  and o.archived_at is null
  and coalesce(o.payment_status, '') in ('succeeded', 'not_required')
  and o.status in ('assigned', 'processing', 'packed', 'dispatched', 'in_transit', 'delivered');

create or replace function public.convert_enquiry_to_order_atomic(
  p_enquiry_id uuid,
  p_actor_id uuid,
  p_order jsonb,
  p_order_items jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_timeline jsonb;
  v_now timestamptz := now();
begin
  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'enquiry_not_found');
  end if;

  if v_enquiry.converted_order_id is not null then
    select * into v_order from public.orders where id = v_enquiry.converted_order_id;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'order_id', v_enquiry.converted_order_id,
      'order_number', v_order.order_number
    );
  end if;

  insert into public.orders (
    order_number, customer_email, status, payment_status, fulfillment_status,
    channel, subtotal, total, currency, items, metadata, timeline,
    created_by, created_by_user_id, source_enquiry_id, updated_at
  )
  values (
    coalesce(p_order->>'order_number', null),
    coalesce(p_order->>'customer_email', v_enquiry.customer_email),
    coalesce(p_order->>'status', 'admin_review'),
    coalesce(p_order->>'payment_status', 'requires_payment'),
    coalesce(p_order->>'fulfillment_status', 'pending'),
    coalesce(p_order->>'channel', 'checkout'),
    coalesce((p_order->>'subtotal')::numeric, 0),
    coalesce((p_order->>'total')::numeric, 0),
    coalesce(p_order->>'currency', 'INR'),
    coalesce(p_order->'items', '[]'::jsonb),
    coalesce(p_order->'metadata', '{}'::jsonb) || jsonb_build_object('source_enquiry_id', p_enquiry_id::text),
    coalesce(p_order->'timeline', '[]'::jsonb),
    p_actor_id,
    nullif(p_order->>'created_by_user_id', '')::uuid,
    p_enquiry_id,
    v_now
  )
  returning * into v_order;

  v_order_id := v_order.id;

  for v_item in select * from jsonb_array_elements(coalesce(p_order_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      order_id, product_slug, product_name, bundle_id, sku,
      quantity, unit_price, line_total, metadata
    )
    values (
      v_order_id,
      v_item->>'product_slug',
      v_item->>'product_name',
      nullif(v_item->>'bundle_id', ''),
      nullif(v_item->>'sku', ''),
      coalesce((v_item->>'quantity')::integer, 1),
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'line_total')::numeric, 0),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  v_timeline := coalesce(v_enquiry.payload, '{}'::jsonb);
  v_timeline := jsonb_set(
    v_timeline, '{timeline}',
    coalesce(v_timeline->'timeline', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'at', v_now, 'action', 'converted', 'actor_id', p_actor_id,
        'summary', 'Enquiry converted to order ' || coalesce(v_order.order_number, v_order_id::text),
        'status', 'converted',
        'metadata', jsonb_build_object('idempotency_key', p_idempotency_key)
      )
    )
  );

  update public.enquiries
  set status = 'converted', converted_order_id = v_order_id, payload = v_timeline, updated_at = v_now
  where id = p_enquiry_id;

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'order_id', v_order_id, 'order_number', v_order.order_number, 'row', to_jsonb(v_order)
  );
end;
$$;

create or replace function public.link_contact_request_to_order(
  p_contact_request_id uuid,
  p_order_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (select 1 from public.contact_requests where id = p_contact_request_id) then
    return jsonb_build_object('ok', false, 'error', 'contact_request_not_found');
  end if;

  update public.orders
  set source_contact_request_id = p_contact_request_id, updated_at = v_now
  where id = p_order_id;

  update public.contact_requests
  set status = 'converted', converted_order_id = p_order_id,
      payload = jsonb_set(
        coalesce(payload, '{}'::jsonb), '{timeline}',
        coalesce(payload->'timeline', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('at', v_now, 'action', 'converted', 'actor_id', p_actor_id,
            'summary', 'Contact request linked to order', 'status', 'converted')
        )
      ),
      updated_at = v_now
  where id = p_contact_request_id;

  return jsonb_build_object('ok', true, 'contact_request_id', p_contact_request_id, 'order_id', p_order_id);
end;
$$;

alter table public.contact_requests enable row level security;

drop policy if exists "contact_requests admin read" on public.contact_requests;
create policy "contact_requests admin read" on public.contact_requests
for select to authenticated using (public.has_cms_permission('enquiries.read'));

drop policy if exists "contact_requests admin write" on public.contact_requests;
create policy "contact_requests admin write" on public.contact_requests
for all to authenticated
using (public.has_cms_permission('enquiries.write'))
with check (public.has_cms_permission('enquiries.write'));

drop policy if exists "contact_requests customer read own" on public.contact_requests;
create policy "contact_requests customer read own" on public.contact_requests
for select to authenticated using (customer_user_id = auth.uid());

drop policy if exists "contact_requests service role manage" on public.contact_requests;
create policy "contact_requests service role manage" on public.contact_requests
for all to service_role using (true) with check (true);

insert into public.permissions (key, label, description)
values ('orders.permanent_delete', 'Permanent Order Delete', 'Hard-delete orders from trash.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
values ('admin', 'orders.permanent_delete')
on conflict (role_key, permission_key) do nothing;
