-- Fix Agri Community World intro body: remove red inline color, force white text.
update public.admin_settings
set
  payload = jsonb_set(
    jsonb_set(
      payload,
      '{homepage,missions,agri,body}',
      to_jsonb('<p style="text-align:left;color:#ffffff">Register, book, and finance drones across India''s AGRONE network.</p>'::text)
    ),
    '{homepage,draftV1,missions,agri,body}',
    to_jsonb('<p style="text-align:left;color:#ffffff">Register, book, and finance drones across India''s AGRONE network.</p>'::text)
  ),
  updated_at = now()
where id = 'global';
