-- Enterprise CMS cutover readiness.
-- Additive only: populate missing published CMS rows and harden operational publication readiness.
-- Fallback loaders, local configs, manifests, URLs, SEO, and storefront rendering contracts remain intact.

insert into public.section_visibility (section_key, route_path, is_visible, status)
values
  ('hero', '/', true, 'published'),
  ('product-icon-rail', '/', true, 'published'),
  ('interests', '/', true, 'published'),
  ('trust', '/', true, 'published'),
  ('cinematic-media-rail', '/', true, 'published'),
  ('community', '/', true, 'published')
on conflict (section_key, route_path) do update set
  is_visible = excluded.is_visible,
  status = excluded.status;

insert into public.testimonials (id, name, role, company, body, rating, sort_order, is_visible, status)
values
  ('smart-farm-team', 'Smart Farm Team', 'Fleet operations', 'Mithron field customer', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 4.8, 10, true, 'published'),
  ('survey-operations', 'Survey Operations', 'Survey lead', 'Mithron field customer', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 4.7, 20, true, 'published'),
  ('industrial-safety-lead', 'Industrial Safety Lead', 'Safety operations', 'Mithron field customer', 'The platform improves coverage confidence, operator visibility, and repeatable aerial workflows across demanding field missions.', 4.8, 30, true, 'published')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  company = excluded.company,
  body = excluded.body,
  rating = excluded.rating,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

insert into public.promotional_campaigns (id, label, headline, body, cta_label, href, sort_order, is_visible, status)
values
  ('agri-deployment-readiness', 'Deployment readiness', 'Plan the next Mithron field deployment', 'Published campaign content is now available from the remote CMS while visual rendering remains rollback-safe.', 'Explore agri systems', '/agriculture', 10, true, 'published'),
  ('drone-care-network', 'Drone Care', 'Keep field fleets ready for mission cycles', 'Service, parts, pilot support, and field workflow content remain governed through the CMS publishing layer.', 'View support', '/product/mithron-care-plus', 20, true, 'published')
on conflict (id) do update set
  label = excluded.label,
  headline = excluded.headline,
  body = excluded.body,
  cta_label = excluded.cta_label,
  href = excluded.href,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

insert into public.content_revisions (entity_table, entity_id, revision, snapshot, change_summary)
values
  ('section_visibility', 'hero:/', 1, '{"section_key":"hero","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('section_visibility', 'product-icon-rail:/', 1, '{"section_key":"product-icon-rail","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('section_visibility', 'interests:/', 1, '{"section_key":"interests","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('section_visibility', 'trust:/', 1, '{"section_key":"trust","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('section_visibility', 'cinematic-media-rail:/', 1, '{"section_key":"cinematic-media-rail","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('section_visibility', 'community:/', 1, '{"section_key":"community","route_path":"/","is_visible":true,"status":"published"}'::jsonb, 'Seed homepage section visibility for staged CMS cutover'),
  ('testimonials', 'smart-farm-team', 1, '{"id":"smart-farm-team","name":"Smart Farm Team","status":"published","is_visible":true}'::jsonb, 'Seed testimonial for staged CMS cutover'),
  ('testimonials', 'survey-operations', 1, '{"id":"survey-operations","name":"Survey Operations","status":"published","is_visible":true}'::jsonb, 'Seed testimonial for staged CMS cutover'),
  ('testimonials', 'industrial-safety-lead', 1, '{"id":"industrial-safety-lead","name":"Industrial Safety Lead","status":"published","is_visible":true}'::jsonb, 'Seed testimonial for staged CMS cutover'),
  ('promotional_campaigns', 'agri-deployment-readiness', 1, '{"id":"agri-deployment-readiness","label":"Deployment readiness","status":"published","is_visible":true}'::jsonb, 'Seed campaign for staged CMS cutover'),
  ('promotional_campaigns', 'drone-care-network', 1, '{"id":"drone-care-network","label":"Drone Care","status":"published","is_visible":true}'::jsonb, 'Seed campaign for staged CMS cutover')
on conflict (entity_table, entity_id, revision) do nothing;

create index if not exists testimonials_public_cutover_idx
  on public.testimonials (status, is_visible, sort_order);

create index if not exists promotional_campaigns_public_cutover_idx
  on public.promotional_campaigns (status, is_visible, sort_order, starts_at, ends_at);

create index if not exists section_visibility_route_cutover_idx
  on public.section_visibility (route_path, status, is_visible, section_key);

drop policy if exists "section_visibility public published read" on public.section_visibility;
create policy "section_visibility public published read"
  on public.section_visibility
  for select
  using (status = 'published');

do $$
declare
  cms_cutover_table text;
begin
  foreach cms_cutover_table in array array[
    'testimonials',
    'promotional_campaigns',
    'section_visibility',
    'homepage_ordering'
  ] loop
    if to_regclass(format('public.%I', cms_cutover_table)) is not null then
      execute format('alter table public.%I replica identity full', cms_cutover_table);
      begin
        execute format('alter publication supabase_realtime add table public.%I', cms_cutover_table);
      exception
        when duplicate_object then null;
        when undefined_object then null;
      end;
    end if;
  end loop;
end $$;
