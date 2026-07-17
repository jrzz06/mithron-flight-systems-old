-- Distributed auth rate-limit buckets used when Upstash Redis is unavailable.
create table if not exists public.auth_rate_limit_buckets (
  bucket_key text primary key,
  hit_count integer not null default 0,
  window_starts_at timestamptz not null default now(),
  window_ms integer not null,
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limit_buckets enable row level security;

create or replace function public.bump_auth_rate_limit(
  p_key text,
  p_max integer,
  p_window_ms integer
)
returns table(allowed boolean, remaining integer, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_rate_limit_buckets%rowtype;
  v_elapsed_ms integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return query select true, p_max, 0;
    return;
  end if;

  insert into public.auth_rate_limit_buckets as b (bucket_key, hit_count, window_starts_at, window_ms, updated_at)
  values (p_key, 1, v_now, greatest(p_window_ms, 1000), v_now)
  on conflict (bucket_key) do update
    set
      hit_count = case
        when (extract(epoch from (v_now - b.window_starts_at)) * 1000) >= b.window_ms then 1
        else b.hit_count + 1
      end,
      window_starts_at = case
        when (extract(epoch from (v_now - b.window_starts_at)) * 1000) >= b.window_ms then v_now
        else b.window_starts_at
      end,
      window_ms = greatest(p_window_ms, 1000),
      updated_at = v_now
    returning * into v_row;

  v_elapsed_ms := greatest(0, floor(extract(epoch from (v_now - v_row.window_starts_at)) * 1000)::integer);

  if v_row.hit_count > p_max then
    return query select false, 0, greatest(v_row.window_ms - v_elapsed_ms, 0);
  else
    return query select true, greatest(p_max - v_row.hit_count, 0), 0;
  end if;
end;
$$;

create or replace function public.peek_auth_rate_limit(
  p_key text,
  p_max integer
)
returns table(allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_rate_limit_buckets%rowtype;
  v_elapsed_ms integer;
begin
  select * into v_row from public.auth_rate_limit_buckets where bucket_key = p_key;
  if not found then
    return query select true, p_max;
    return;
  end if;

  v_elapsed_ms := greatest(0, floor(extract(epoch from (v_now - v_row.window_starts_at)) * 1000)::integer);
  if v_elapsed_ms >= v_row.window_ms then
    return query select true, p_max;
    return;
  end if;

  if v_row.hit_count >= p_max then
    return query select false, 0;
  else
    return query select true, greatest(p_max - v_row.hit_count, 0);
  end if;
end;
$$;

create or replace function public.clear_auth_rate_limit(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.auth_rate_limit_buckets where bucket_key = p_key;
end;
$$;

revoke all on function public.bump_auth_rate_limit(text, integer, integer) from public;
revoke all on function public.peek_auth_rate_limit(text, integer) from public;
revoke all on function public.clear_auth_rate_limit(text) from public;
revoke execute on function public.bump_auth_rate_limit(text, integer, integer) from anon, authenticated;
revoke execute on function public.peek_auth_rate_limit(text, integer) from anon, authenticated;
revoke execute on function public.clear_auth_rate_limit(text) from anon, authenticated;
grant execute on function public.bump_auth_rate_limit(text, integer, integer) to service_role;
grant execute on function public.peek_auth_rate_limit(text, integer) to service_role;
grant execute on function public.clear_auth_rate_limit(text) to service_role;
