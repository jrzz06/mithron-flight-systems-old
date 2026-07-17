-- Wix-style product tax groups with GST backfill for existing catalog rows.

ALTER TABLE public.mithron_products
  ADD COLUMN IF NOT EXISTS tax_group text;

ALTER TABLE public.mithron_products
  DROP CONSTRAINT IF EXISTS mithron_products_tax_group_check;

ALTER TABLE public.mithron_products
  ADD CONSTRAINT mithron_products_tax_group_check
  CHECK (
    tax_group IS NULL OR tax_group IN (
      'products-default',
      'agri-accessories',
      'non-agri-drones',
      'non-agri-accessories',
      'agri-drones'
    )
  );

COMMENT ON COLUMN public.mithron_products.tax_group IS 'Wix-style product tax group used to derive GST rate.';

UPDATE public.mithron_products
SET tax_group = CASE
  WHEN lower(trim(category)) = 'agri drones' THEN 'agri-drones'
  WHEN lower(trim(category)) IN ('video drones', 'creative drones', 'surveillance drones', 'global products') THEN 'non-agri-drones'
  WHEN lower(trim(category)) = 'accessories' AND (
    name ILIKE '%agri%'
    OR name ILIKE '%kisan%'
    OR name ILIKE '%agricultur%'
    OR name ILIKE '%spray%'
    OR name ILIKE '%spreader%'
    OR name ILIKE '%festo%'
    OR name ILIKE '%pump%'
    OR name ILIKE '%seeder%'
    OR name ILIKE '%crop%'
    OR name ILIKE '%field%'
  ) THEN 'agri-accessories'
  WHEN lower(trim(category)) = 'accessories' THEN 'non-agri-accessories'
  WHEN name ILIKE '%drone%' AND (
    name ILIKE '%agri%'
    OR name ILIKE '%kisan%'
    OR name ILIKE '%agricultur%'
  ) THEN 'agri-drones'
  WHEN name ILIKE '%drone%' THEN 'non-agri-drones'
  ELSE 'products-default'
END
WHERE tax_group IS NULL;

UPDATE public.mithron_products
SET tax_rate = CASE tax_group
  WHEN 'agri-drones' THEN 5
  WHEN 'agri-accessories' THEN 12
  WHEN 'non-agri-drones' THEN 18
  WHEN 'non-agri-accessories' THEN 18
  ELSE 18
END
WHERE charge_tax = true AND (tax_rate IS NULL OR tax_rate = 0);

UPDATE public.mithron_products
SET charge_tax = true
WHERE charge_tax IS NULL;

UPDATE public.mithron_products
SET tax_included = false
WHERE tax_included IS NULL;
