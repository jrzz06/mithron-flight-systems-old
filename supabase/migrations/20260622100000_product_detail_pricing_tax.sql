-- Product detail, Wix-style pricing, and tax fields for admin catalog management.

ALTER TABLE public.mithron_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS on_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS cost_of_goods numeric,
  ADD COLUMN IF NOT EXISTS show_price_per_unit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS charge_tax boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_rate numeric,
  ADD COLUMN IF NOT EXISTS tax_included boolean NOT NULL DEFAULT false;

ALTER TABLE public.mithron_products
  DROP CONSTRAINT IF EXISTS mithron_products_discount_type_check;

ALTER TABLE public.mithron_products
  ADD CONSTRAINT mithron_products_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('percent', 'amount'));

COMMENT ON COLUMN public.mithron_products.description IS 'Rich HTML product description shown on storefront overview.';
COMMENT ON COLUMN public.mithron_products.on_sale IS 'Whether the product is currently on sale.';
COMMENT ON COLUMN public.mithron_products.discount_type IS 'Discount unit: percent or fixed amount in INR.';
COMMENT ON COLUMN public.mithron_products.discount_value IS 'Discount magnitude matching discount_type.';
COMMENT ON COLUMN public.mithron_products.cost_of_goods IS 'Internal cost of goods for margin calculations.';
COMMENT ON COLUMN public.mithron_products.show_price_per_unit IS 'Whether to show a per-unit price on the storefront.';
COMMENT ON COLUMN public.mithron_products.charge_tax IS 'Whether tax should be charged on this product.';
COMMENT ON COLUMN public.mithron_products.tax_rate IS 'Tax rate percentage applied when charge_tax is true.';
COMMENT ON COLUMN public.mithron_products.tax_included IS 'Whether the listed price already includes tax.';
