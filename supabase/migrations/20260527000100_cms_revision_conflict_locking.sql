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
  exception
    when unique_violation then
      select coalesce(max(revision), 0) + 1
        into v_revision
      from public.content_revisions
      where entity_table = p_entity_table
        and entity_id = p_entity_id;

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
  end;

  return v_record;
end;
$$;

grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to service_role;
