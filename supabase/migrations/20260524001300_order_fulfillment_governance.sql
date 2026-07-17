-- Enterprise order fulfillment governance.
-- Additive only: validates new/direct fulfillment writes without removing existing rows.

create or replace function public.normalize_order_fulfillment_status(status_value text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(status_value, ''), 'pending'))
    when 'queued' then 'pending'
    when 'draft' then 'pending'
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

  if next_status not in ('pending', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'returned') then
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
    when 'pending' then array['processing', 'cancelled']
    when 'processing' then array['packed', 'cancelled']
    when 'packed' then array['shipped', 'cancelled']
    when 'shipped' then array['delivered', 'returned']
    when 'delivered' then array['returned']
    when 'cancelled' then array[]::text[]
    when 'returned' then array[]::text[]
    else array[]::text[]
  end;

  if not (next_status = any(allowed_next)) then
    raise exception 'Invalid order fulfillment transition % -> %.', previous_status, next_status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_fulfillment_transition_guard on public.orders;
create trigger orders_fulfillment_transition_guard
before insert or update of fulfillment_status on public.orders
for each row
execute function public.enforce_order_fulfillment_transition();
