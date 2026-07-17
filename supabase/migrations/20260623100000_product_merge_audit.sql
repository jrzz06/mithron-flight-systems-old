-- Product merge audit + transactional duplicate merge RPC.

create table if not exists public.product_merge_audit (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null,
  target_slug text not null references public.mithron_products(slug) on delete restrict,
  merged_at timestamptz not null default timezone('utc', now()),
  source_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  rollback_hint text
);

create index if not exists product_merge_audit_source_idx on public.product_merge_audit (source_slug);
create index if not exists product_merge_audit_target_idx on public.product_merge_audit (target_slug);

alter table public.product_merge_audit enable row level security;

drop policy if exists "product_merge_audit service role manage" on public.product_merge_audit;
create policy "product_merge_audit service role manage"
  on public.product_merge_audit
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.product_merge_audit from anon, authenticated;
grant all on table public.product_merge_audit to service_role;

alter table public.mithron_products
  add column if not exists merged_into_slug text,
  add column if not exists merge_status text;

alter table public.mithron_products
  drop constraint if exists mithron_products_merge_status_check;

alter table public.mithron_products
  add constraint mithron_products_merge_status_check
  check (merge_status is null or merge_status in ('active', 'archived_merged'));

create index if not exists mithron_products_merged_into_slug_idx
  on public.mithron_products (merged_into_slug)
  where merged_into_slug is not null;

comment on table public.product_merge_audit is 'Rollback log for archived duplicate product merges.';
comment on column public.mithron_products.merged_into_slug is 'Canonical slug when this row was archived as a duplicate.';
comment on column public.mithron_products.merge_status is 'active or archived_merged.';

create or replace function public.merge_product_into_canonical(
  p_source_slug text,
  p_target_slug text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.mithron_products%rowtype;
  v_target public.mithron_products%rowtype;
begin
  if p_source_slug is null or p_target_slug is null then
    raise exception 'source_slug and target_slug are required';
  end if;

  if p_source_slug = p_target_slug then
    raise exception 'source_slug and target_slug must differ';
  end if;

  select * into v_source from public.mithron_products where slug = p_source_slug for update;
  if not found then
    raise exception 'source product not found: %', p_source_slug;
  end if;

  select * into v_target from public.mithron_products where slug = p_target_slug for update;
  if not found then
    raise exception 'target product not found: %', p_target_slug;
  end if;

  if v_source.merge_status = 'archived_merged' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_archived');
  end if;

  delete from public.product_media_assets pma_source
  using public.product_media_assets pma_target
  where pma_source.product_slug = p_source_slug
    and pma_target.product_slug = p_target_slug
    and pma_target.media_asset_id = pma_source.media_asset_id
    and pma_target.usage = pma_source.usage;

  update public.product_media_assets
  set product_slug = p_target_slug,
      updated_at = timezone('utc', now())
  where product_slug = p_source_slug;

  update public.warehouse_stock
  set product_slug = p_target_slug,
      updated_at = timezone('utc', now())
  where product_slug = p_source_slug;

  update public.inventory
  set product_slug = p_target_slug,
      updated_at = timezone('utc', now())
  where product_slug = p_source_slug;

  update public.inventory_movements
  set product_id = p_target_slug
  where product_id = p_source_slug;

  update public.order_items
  set product_slug = p_target_slug
  where product_slug = p_source_slug;

  update public.product_reviews
  set product_slug = p_target_slug
  where product_slug = p_source_slug;

  update public.faqs
  set product_slug = p_target_slug
  where product_slug = p_source_slug;

  update public.hero_banners
  set product_slug = p_target_slug
  where product_slug = p_source_slug;

  update public.enquiries
  set related_product_slug = p_target_slug
  where related_product_slug = p_source_slug;

  insert into public.product_merge_audit (source_slug, target_slug, source_snapshot, reason)
  values (
    p_source_slug,
    p_target_slug,
    to_jsonb(v_source),
    coalesce(p_reason, 'merge_product_into_canonical')
  );

  update public.mithron_products
  set
    workflow_status = 'archived',
    is_visible = false,
    merged_into_slug = p_target_slug,
    merge_status = 'archived_merged',
    archived_at = coalesce(archived_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where slug = p_source_slug;

  return jsonb_build_object(
    'ok', true,
    'source_slug', p_source_slug,
    'target_slug', p_target_slug
  );
end;
$$;

revoke all on function public.merge_product_into_canonical(text, text, text) from public;
revoke all on function public.merge_product_into_canonical(text, text, text) from anon;
revoke all on function public.merge_product_into_canonical(text, text, text) from authenticated;

grant execute on function public.merge_product_into_canonical(text, text, text) to service_role;
