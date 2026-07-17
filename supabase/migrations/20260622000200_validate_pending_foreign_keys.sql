-- Clean orphan product_slug references, then validate deferred foreign keys.

update public.product_reviews
set product_slug = null
where product_slug is not null
  and not exists (
    select 1 from public.mithron_products p where p.slug = product_reviews.product_slug
  );

update public.faqs
set product_slug = null
where product_slug is not null
  and not exists (
    select 1 from public.mithron_products p where p.slug = faqs.product_slug
  );

update public.hero_banners
set product_slug = null
where product_slug is not null
  and not exists (
    select 1 from public.mithron_products p where p.slug = hero_banners.product_slug
  );

update public.enquiries
set related_product_slug = null
where related_product_slug is not null
  and not exists (
    select 1 from public.mithron_products p where p.slug = enquiries.related_product_slug
  );

delete from public.order_items oi
where not exists (
  select 1 from public.mithron_products p where p.slug = oi.product_slug
);

delete from public.warehouse_stock ws
where not exists (
  select 1 from public.mithron_products p where p.slug = ws.product_slug
);

alter table public.product_reviews validate constraint product_reviews_product_slug_fk;
alter table public.faqs validate constraint faqs_product_slug_fk;
alter table public.hero_banners validate constraint hero_banners_product_slug_fk;
alter table public.enquiries validate constraint enquiries_related_product_slug_fk;
alter table public.order_items validate constraint order_items_product_slug_fk;
alter table public.warehouse_stock validate constraint warehouse_stock_product_slug_fk;
