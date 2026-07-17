-- Add NOT VALID FK constraints linking CMS product_slug columns to mithron_products.
-- VALIDATE CONSTRAINT can run in a maintenance window after deploy.

alter table public.product_reviews
  add constraint product_reviews_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete set null not valid;

alter table public.faqs
  add constraint faqs_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete set null not valid;

alter table public.hero_banners
  add constraint hero_banners_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete set null not valid;

alter table public.enquiries
  add constraint enquiries_related_product_slug_fk
  foreign key (related_product_slug) references public.mithron_products(slug)
  on delete set null not valid;
