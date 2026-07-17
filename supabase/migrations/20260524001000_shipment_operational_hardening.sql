-- Shipment operational hardening.
-- Additive only: extend the existing shipment lifecycle without replacing order, stock, or fallback systems.

alter table public.shipments
  add column if not exists damaged_at timestamptz;

alter table public.shipments
  drop constraint if exists shipments_status_chk;

alter table public.shipments
  add constraint shipments_status_chk check (
    shipment_status in (
      'pending',
      'reserved',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'damaged',
      'cancelled'
    )
  );

alter table public.shipment_timeline
  drop constraint if exists shipment_timeline_next_status_chk;

alter table public.shipment_timeline
  add constraint shipment_timeline_next_status_chk check (
    next_status in (
      'pending',
      'reserved',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'damaged',
      'cancelled'
    )
  );

alter table public.shipment_timeline
  drop constraint if exists shipment_timeline_previous_status_chk;

alter table public.shipment_timeline
  add constraint shipment_timeline_previous_status_chk check (
    previous_status is null or previous_status in (
      'pending',
      'reserved',
      'packed',
      'ready_for_pickup',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'damaged',
      'cancelled'
    )
  );

create index if not exists shipments_operational_queue_idx
  on public.shipments (warehouse_id, shipment_status, updated_at desc)
  where shipment_status in ('pending', 'reserved', 'packed', 'ready_for_pickup', 'damaged');

do $$
begin
  alter publication supabase_realtime add table public.shipments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.shipment_timeline;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
