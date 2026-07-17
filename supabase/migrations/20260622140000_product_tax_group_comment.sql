-- Clarify product tax group column as Indian GST catalog groups (post-Wix migration).

COMMENT ON COLUMN public.mithron_products.tax_group IS
  'Indian GST catalog group used to derive the product tax rate.';
