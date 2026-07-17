-- Replace legacy Wix CSV import markers with the canonical Supabase import tag.
update public.mithron_products
set
  source_availability = 'uploaded_csv',
  updated_at = now()
where source_availability in ('wix_inventory_csv', 'legacy_csv_import');
