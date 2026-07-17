-- Replace legacy mock footer columns with verified official Mithron links.

update public.footer_columns
set is_visible = false,
    status = 'archived',
    updated_at = now()
where id in ('products', 'operations', 'company');

update public.footer_links
set is_visible = false,
    status = 'archived',
    updated_at = now()
where column_id in ('products', 'operations', 'company');

insert into public.footer_columns (id, title, sort_order, is_visible, status) values
  ('footer-official-platforms', 'Official platforms', 10, true, 'published'),
  ('footer-shop-store', 'Shop this store', 20, true, 'published'),
  ('footer-social-media', 'Social media', 30, true, 'published'),
  ('footer-company-profiles', 'Company profiles', 40, true, 'published')
on conflict (id) do update set
  title = excluded.title,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();

insert into public.footer_links (id, column_id, label, href, sort_order, is_visible, status) values
  ('footer-official-smart', 'footer-official-platforms', 'Mithron Smart Platform', 'https://www.mithronsmart.com', 10, true, 'published'),
  ('footer-official-store', 'footer-official-platforms', 'Mithron Store', 'https://www.mithron.co', 20, true, 'published'),
  ('footer-official-agrone', 'footer-official-platforms', 'AGRONE (Agri Drone Platform)', 'https://www.mithronsmart.com/agri-drone-business', 30, true, 'published'),
  ('footer-official-zroneo', 'footer-official-platforms', 'ZRONEO (City Drone App)', 'https://play.google.com/store/apps/details?id=com.mithronfarmer', 40, true, 'published'),
  ('footer-official-droning', 'footer-official-platforms', 'Droning Platform', 'https://drone.mithronsmart.com', 50, true, 'published'),
  ('footer-official-login', 'footer-official-platforms', 'Droning Login Selector', 'https://drone.mithronsmart.com/selectlogin', 60, true, 'published'),
  ('footer-official-emi', 'footer-official-platforms', 'Drone EMI Portal', 'https://drone.mithronsmart.com/drone-emi', 70, true, 'published'),
  ('footer-shop-agri', 'footer-shop-store', 'Agri Drones', '/category/agri-drones', 10, true, 'published'),
  ('footer-shop-video', 'footer-shop-store', 'Video Drones', '/category/video-drones', 20, true, 'published'),
  ('footer-shop-survey', 'footer-shop-store', 'Survey Drones', '/category/survey-drones', 30, true, 'published'),
  ('footer-shop-accessories', 'footer-shop-store', 'Accessories & Drone Care', '/category/accessories', 40, true, 'published'),
  ('footer-shop-all', 'footer-shop-store', 'All Products', '/products', 50, true, 'published'),
  ('footer-shop-contact', 'footer-shop-store', 'Contact', '/contact', 60, true, 'published'),
  ('footer-social-linkedin', 'footer-social-media', 'Mithron LinkedIn', 'https://www.linkedin.com/company/mithron-india-smart-services-pvt-ltd/', 10, true, 'published'),
  ('footer-social-instagram', 'footer-social-media', 'Mithron Instagram', 'https://www.instagram.com/mithronsmart/', 20, true, 'published'),
  ('footer-social-facebook', 'footer-social-media', 'Mithron Facebook', 'https://www.facebook.com/p/Mithron-India-Agtech-100088815738230/', 30, true, 'published'),
  ('footer-social-youtube', 'footer-social-media', 'Mithron YouTube', 'https://www.youtube.com/channel/UCzeHU4vY6q1y1xrGkXsv5ow', 40, true, 'published'),
  ('footer-profile-yourstory', 'footer-company-profiles', 'YourStory — Mithron Profile', 'https://yourstory.com/companies/mithron', 10, true, 'published'),
  ('footer-profile-tracxn', 'footer-company-profiles', 'Tracxn — Mithronsmart Profile', 'https://tracxn.com/d/companies/mithronsmart/__FmiZvI2eEsKhWNfarQr2GubD-_ogeU7kHosSGe9dQSo', 20, true, 'published'),
  ('footer-profile-cio', 'footer-company-profiles', 'CIO Tech Outlook — Mithron Feature', 'https://www.ciotechoutlook.com/technology/drone-tech-startups/vendor/2025/mithron', 30, true, 'published')
on conflict (id) do update set
  column_id = excluded.column_id,
  label = excluded.label,
  href = excluded.href,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible,
  status = excluded.status,
  updated_at = now();
