-- CMS consolidation: hot-path indexes (idempotent, no schema changes)

create index if not exists admin_settings_id_updated_idx
  on public.admin_settings (id, updated_at desc);

create index if not exists homepage_sections_key_status_idx
  on public.homepage_sections (section_key, status);

-- footer_links_column_sort_idx applied in 20260614000100_supabase_optimization_hot_path_indexes.sql
