create or replace function public.assign_content_revision_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_revision integer;
begin
  if nullif(btrim(new.entity_table), '') is null then
    raise exception 'content revision entity_table is required' using errcode = '22023';
  end if;

  if nullif(btrim(new.entity_id), '') is null then
    raise exception 'content revision entity_id is required' using errcode = '22023';
  end if;

  if new.snapshot is null or jsonb_typeof(new.snapshot) <> 'object' then
    raise exception 'content revision snapshot must be a JSON object' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.entity_table), hashtext(new.entity_id));

  select coalesce(max(revision), 0) + 1
    into v_next_revision
  from public.content_revisions
  where entity_table = new.entity_table
    and entity_id = new.entity_id;

  new.revision := v_next_revision;
  new.snapshot := new.snapshot || jsonb_build_object('revision', v_next_revision);

  return new;
end;
$$;

drop trigger if exists content_revisions_assign_revision on public.content_revisions;

create trigger content_revisions_assign_revision
before insert on public.content_revisions
for each row
execute function public.assign_content_revision_number();
