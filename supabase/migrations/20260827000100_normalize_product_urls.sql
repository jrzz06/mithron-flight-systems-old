-- Backfill legacy Wix / absolute product_url values to canonical `/product/{slug}` paths.
UPDATE public.mithron_products
SET product_url = '/product/' || slug
WHERE slug IS NOT NULL
  AND slug <> ''
  AND (
    product_url IS NULL
    OR btrim(product_url) = ''
    OR product_url ILIKE '%product-page%'
    OR product_url ~* '^https?://'
    OR product_url NOT LIKE '/product/%'
  );
