-- Harden normalize_order_fulfillment_status against mutable search_path (Supabase advisor).

create or replace function public.normalize_order_fulfillment_status(status_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(nullif(status_value, ''), 'pending'))
    when 'queued' then 'pending'
    when 'draft' then 'pending'
    when 'fulfilled' then 'delivered'
    when 'completed' then 'delivered'
    else lower(coalesce(nullif(status_value, ''), 'pending'))
  end;
$$;
