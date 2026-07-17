alter table public.product_media_assets
  add constraint product_media_assets_product_slug_fk
  foreign key (product_slug) references public.mithron_products(slug)
  on delete cascade not valid;

alter table public.product_media_assets
  validate constraint product_media_assets_product_slug_fk;
