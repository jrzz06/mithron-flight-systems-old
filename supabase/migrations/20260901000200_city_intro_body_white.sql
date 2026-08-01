-- Fix City Drone World intro body: force white text (published + draft).
update public.admin_settings
set
  payload = jsonb_set(
    jsonb_set(
      payload,
      '{homepage,missions,city,body}',
      to_jsonb('<p style="color:#ffffff">Urban platforms for rentals, training, care, and technician support.</p>'::text)
    ),
    '{homepage,draftV1,missions,city,body}',
    to_jsonb('<p style="color:#ffffff">Urban platforms for rentals, training, care, and technician support.</p>'::text)
  ),
  updated_at = now()
where id = 'global';
