-- Remove legacy CMS marketing testimonials that were never storefront-facing.

delete from public.product_reviews
where id in (
  'smart-farm-team',
  'survey-operations',
  'industrial-safety-lead'
);
