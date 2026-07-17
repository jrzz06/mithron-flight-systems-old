create or replace function public.cms_insert_content_revision(
  p_entity_table text,
  p_entity_id text,
  p_snapshot jsonb,
  p_change_summary text default null,
  p_created_by uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
  v_record json;
  v_revision_attempt integer;
begin
  if nullif(btrim(p_entity_table), '') is null then
    raise exception 'content revision entity_table is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_entity_id), '') is null then
    raise exception 'content revision entity_id is required' using errcode = '22023';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'content revision snapshot must be a JSON object' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_entity_table), hashtext(p_entity_id));

  for v_revision_attempt in 1..3 loop
    select coalesce(max(revision), 0) + 1
      into v_revision
    from public.content_revisions
    where entity_table = p_entity_table
      and entity_id = p_entity_id;

    begin
      insert into public.content_revisions (
        entity_table,
        entity_id,
        revision,
        snapshot,
        change_summary,
        created_by
      )
      values (
        p_entity_table,
        p_entity_id,
        v_revision,
        p_snapshot || jsonb_build_object('revision', v_revision),
        p_change_summary,
        p_created_by
      )
      returning to_json(content_revisions.*) into v_record;

      return v_record;
    exception
      when unique_violation then
        if v_revision_attempt >= 3 then
          raise;
        end if;

        raise log 'cms_insert_content_revision revision conflict table=% entity_id=% attempted_revision=% retry=%',
          p_entity_table, p_entity_id, v_revision, v_revision_attempt + 1;
    end;
  end loop;

  raise exception 'Failed to create content revision after 3 attempts for %.%', p_entity_table, p_entity_id using errcode = '23505';
end;
$$;

grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to service_role;

create or replace function public.cms_mutate_content_with_revision(
  p_operation text,
  p_entity_table text,
  p_entity_id text,
  p_identity jsonb,
  p_patch jsonb,
  p_change_summary text default null,
  p_actor_id uuid default null,
  p_request_id text default null,
  p_attempt integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_tables constant text[] := array[
    'hero_banners',
    'homepage_sections',
    'section_visibility',
    'homepage_ordering',
    'cms_pages',
    'cms_sections',
    'site_navigation',
    'footer_columns',
    'footer_links',
    'category_metadata',
    'trust_cards',
    'ecosystem_cards',
    'deployment_locations',
    'testimonials',
    'product_reviews',
    'faqs',
    'promotional_campaigns'
  ];
  v_operation text := lower(nullif(btrim(p_operation), ''));
  v_entity_table text := nullif(btrim(p_entity_table), '');
  v_entity_id text := nullif(btrim(p_entity_id), '');
  v_identity jsonb := coalesce(p_identity, '{}'::jsonb);
  v_input_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_columns text[] := array[]::text[];
  v_key text;
  v_where text := '';
  v_update_patch jsonb := '{}'::jsonb;
  v_revision_patch jsonb := '{}'::jsonb;
  v_set_clause text := '';
  v_revision integer;
  v_revision_id uuid;
  v_revision_attempt integer;
  v_before jsonb;
  v_record jsonb;
  v_snapshot jsonb;
begin
  if v_operation not in ('publish', 'archive', 'restore') then
    raise exception 'unsupported CMS revision operation: %', p_operation using errcode = '22023';
  end if;

  if v_entity_table is null or not (v_entity_table = any(v_allowed_tables)) then
    raise exception 'unsupported CMS revision table: %', p_entity_table using errcode = '22023';
  end if;

  if v_entity_id is null then
    raise exception 'CMS revision entity_id is required' using errcode = '22023';
  end if;

  if to_regclass('public.' || quote_ident(v_entity_table)) is null then
    raise exception 'CMS revision table does not exist: %', v_entity_table using errcode = '42P01';
  end if;

  if jsonb_typeof(v_identity) <> 'object' or v_identity = '{}'::jsonb then
    raise exception 'CMS revision identity must be a non-empty JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(v_input_patch) <> 'object' then
    raise exception 'CMS revision patch must be a JSON object' using errcode = '22023';
  end if;

  select coalesce(array_agg(column_name::text order by ordinal_position), array[]::text[])
    into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_entity_table;

  for v_key in select jsonb_object_keys(v_identity) loop
    if nullif(btrim(v_identity ->> v_key), '') is null then
      raise exception 'CMS revision identity value is required for column %', v_key using errcode = '22023';
    end if;

    if not (v_key = any(v_columns)) then
      raise exception 'CMS revision identity column %.% does not exist', v_entity_table, v_key using errcode = '42703';
    end if;

    if v_where = '' then
      v_where := format('(%I)::text = %L', v_key, v_identity ->> v_key);
    else
      v_where := v_where || ' and ' || format('(%I)::text = %L', v_key, v_identity ->> v_key);
    end if;
  end loop;

  raise log 'cms_mutate_content_with_revision start request_id=% table=% entity_id=% operation=% attempt=%',
    p_request_id, v_entity_table, v_entity_id, v_operation, p_attempt;

  perform pg_advisory_xact_lock(hashtext(v_entity_table), hashtext(v_entity_id));

  execute format('select to_jsonb(t) from public.%I as t where %s for update', v_entity_table, v_where)
    into v_before;

  if v_before is null then
    raise exception 'CMS revision target row not found: %.%', v_entity_table, v_entity_id using errcode = 'P0002';
  end if;

  v_update_patch := v_input_patch - 'revision' - 'created_at' - 'created_by';

  for v_key in select jsonb_object_keys(v_identity) loop
    v_update_patch := v_update_patch - v_key;
  end loop;

  for v_key in select jsonb_object_keys(v_update_patch) loop
    if not (v_key = any(v_columns)) then
      raise exception 'CMS revision patch column %.% does not exist', v_entity_table, v_key using errcode = '42703';
    end if;
  end loop;

  if 'updated_at' = any(v_columns) then
    v_update_patch := v_update_patch || jsonb_build_object('updated_at', now());
  end if;

  if p_actor_id is not null and 'updated_by' = any(v_columns) then
    v_update_patch := v_update_patch || jsonb_build_object('updated_by', p_actor_id);
  end if;

  for v_revision_attempt in 1..3 loop
    select coalesce(max(revision), 0) + 1 as next_revision
      into v_revision
    from public.content_revisions
    where entity_table = v_entity_table
      and entity_id = v_entity_id;

    if 'revision' = any(v_columns) then
      v_revision_patch := jsonb_build_object('revision', v_revision);
    else
      v_revision_patch := '{}'::jsonb;
    end if;

    v_snapshot := v_before || v_update_patch || v_revision_patch || jsonb_build_object('revision', v_revision);

    raise log 'cms_mutate_content_with_revision revision request_id=% table=% entity_id=% next_revision=% revision_attempt=% patch_keys=%',
      p_request_id, v_entity_table, v_entity_id, v_revision, v_revision_attempt, (
        select array_agg(key order by key)
        from jsonb_object_keys(v_update_patch || v_revision_patch) as key
      );

    begin
      insert into public.content_revisions (
        entity_table,
        entity_id,
        revision,
        snapshot,
        change_summary,
        created_by
      )
      values (
        v_entity_table,
        v_entity_id,
        v_revision,
        v_snapshot,
        p_change_summary,
        p_actor_id
      )
      returning id into v_revision_id;

      v_update_patch := v_update_patch || v_revision_patch;
      exit;
    exception
      when unique_violation then
        if v_revision_attempt >= 3 then
          raise;
        end if;

        raise log 'cms_mutate_content_with_revision revision conflict request_id=% table=% entity_id=% attempted_revision=% retry=%',
          p_request_id, v_entity_table, v_entity_id, v_revision, v_revision_attempt + 1;
    end;
  end loop;

  if v_revision_id is null then
    raise exception 'Failed to create CMS revision after 3 attempts for %.%', v_entity_table, v_entity_id using errcode = '23505';
  end if;

  for v_key in select jsonb_object_keys(v_update_patch) loop
    if v_set_clause = '' then
      v_set_clause := format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', v_key, v_entity_table, v_key);
    else
      v_set_clause := v_set_clause || ', ' || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', v_key, v_entity_table, v_key);
    end if;
  end loop;

  if v_set_clause = '' then
    raise exception 'CMS revision mutation has no updateable fields for %.%', v_entity_table, v_entity_id using errcode = '22023';
  end if;

  execute format('update public.%I as t set %s where %s returning to_jsonb(t)', v_entity_table, v_set_clause, v_where)
    using v_update_patch
    into v_record;

  if v_record is null then
    raise exception 'CMS revision target row disappeared during update: %.%', v_entity_table, v_entity_id using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    p_actor_id,
    'cms.' || v_operation,
    v_entity_table,
    v_entity_id,
    v_before,
    v_record,
    jsonb_build_object(
      'source', 'cms_mutate_content_with_revision',
      'request_id', p_request_id,
      'attempt', p_attempt,
      'revision_attempt', v_revision_attempt,
      'revision', v_revision,
      'revision_id', v_revision_id,
      'changed_fields', (
        select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
        from jsonb_object_keys(v_update_patch) as key
      )
    )
  );

  raise log 'cms_mutate_content_with_revision end request_id=% table=% entity_id=% operation=% revision=% revision_id=%',
    p_request_id, v_entity_table, v_entity_id, v_operation, v_revision, v_revision_id;

  return jsonb_build_object(
    'record', v_record,
    'revision', v_revision,
    'revision_id', v_revision_id,
    'debug', jsonb_build_object(
      'request_id', p_request_id,
      'operation', v_operation,
      'target_table', v_entity_table,
      'entity_id', v_entity_id,
      'attempt', p_attempt,
      'revision_attempt', v_revision_attempt,
      'lock_acquired', true,
      'calculated_revision', v_revision
    )
  );
end;
$$;

grant execute on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) to authenticated;
grant execute on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) to service_role;
