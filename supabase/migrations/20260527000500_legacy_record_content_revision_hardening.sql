create or replace function public.record_content_revision(
  target_table text,
  target_id text,
  target_revision integer,
  target_snapshot jsonb,
  target_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_id uuid;
  v_revision integer;
  v_revision_attempt integer;
begin
  if nullif(btrim(target_table), '') is null then
    raise exception 'content revision target_table is required' using errcode = '22023';
  end if;

  if nullif(btrim(target_id), '') is null then
    raise exception 'content revision target_id is required' using errcode = '22023';
  end if;

  if target_snapshot is null or jsonb_typeof(target_snapshot) <> 'object' then
    raise exception 'content revision target_snapshot must be a JSON object' using errcode = '22023';
  end if;

  -- target_revision is intentionally ignored. This legacy function may be
  -- called by older DB triggers or stale clients, so revision ownership stays
  -- inside the database and cannot reuse a row-level stale revision value.
  perform pg_advisory_xact_lock(hashtext(target_table), hashtext(target_id));

  for v_revision_attempt in 1..3 loop
    select coalesce(max(revision), 0) + 1
      into v_revision
    from public.content_revisions
    where entity_table = target_table
      and entity_id = target_id;

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
        target_table,
        target_id,
        v_revision,
        target_snapshot || jsonb_build_object('revision', v_revision),
        target_summary,
        auth.uid()
      )
      returning id into revision_id;

      return revision_id;
    exception
      when unique_violation then
        if v_revision_attempt >= 3 then
          raise;
        end if;

        raise log 'record_content_revision revision conflict table=% entity_id=% attempted_revision=% retry=%',
          target_table, target_id, v_revision, v_revision_attempt + 1;
    end;
  end loop;

  raise exception 'Failed to create content revision after 3 attempts for %.%', target_table, target_id using errcode = '23505';
end;
$$;

grant execute on function public.record_content_revision(text, text, integer, jsonb, text) to authenticated;
grant execute on function public.record_content_revision(text, text, integer, jsonb, text) to service_role;
