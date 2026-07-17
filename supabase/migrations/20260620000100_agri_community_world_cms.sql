-- Sync Agri Community World CMS tiles and heading (AGRONE registration copy).
update public.admin_settings
set payload = jsonb_set(
  jsonb_set(
    payload,
    '{homepage,missions,agri,title}',
    '"Agri Community World"'::jsonb
  ),
  '{homepage,missions,agri,tiles}',
  '[
    {"label":"AGRONE Drone Owner Registration","body":"Register your drone on AGRONE and connect with farmers, pilots, and service demand across India.","operator":"AGRONE Network","model":"DRONE OWNER NETWORK","location":"Pan-India onboarding","imageSrc":"/media/mithron/mission/agrone/agrone-drone-owner-registration.png","imageAlt":"AGRONE drone owner registration","href":"/agriculture"},
    {"label":"AGRONE Pilot Registration","body":"Join the certified pilot network, access training pathways, and receive mission assignments through AGRONE.","operator":"AGRONE Network","model":"AGRONE PILOT NETWORK","location":"Pilot onboarding","imageSrc":"/media/mithron/mission/agrone/agrone-pilot-registration.png","imageAlt":"AGRONE pilot registration","href":"/agriculture"},
    {"label":"All India Farmer Drone Booking","body":"Book drone spraying, mapping, and monitoring services anywhere in India through the AGRONE booking platform.","operator":"AGRONE Network","model":"NATIONWIDE BOOKING","location":"Service booking desk","imageSrc":"/media/mithron/mission/agrone/all-india-drone-farmer.png","imageAlt":"All India farmer drone booking","href":"/agriculture"},
    {"label":"Smart Farmer Registration","body":"Register as a smart farmer to access AGRONE services, crop insights, and on-demand drone support.","operator":"AGRONE Network","model":"SMART FARMER PROGRAM","location":"Farmer onboarding","imageSrc":"/media/mithron/mission/agrone/smart-farmer-register.png","imageAlt":"Smart farmer registration","href":"/agriculture"},
    {"label":"Agri Drone Loan & EMI Check","body":"Check agri-drone loan eligibility, compare EMI plans, and explore financing options backed by AGRONE partners.","operator":"AGRONE Network","model":"FINANCING SUPPORT","location":"Loan eligibility check","imageSrc":"/media/mithron/mission/agrone/agri-drone-loan.png","imageAlt":"Agri drone loan and EMI check","href":"/agriculture"}
  ]'::jsonb
),
updated_at = now()
where id = 'global';
