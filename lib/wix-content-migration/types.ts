import type { WixProductSnapshot } from "../wix/catalog-client.ts";

export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type TipTapDoc = TipTapNode & { type: "doc"; content?: TipTapNode[] };

export type SpecEntry = { key: string; value: string };

export type MigratedImage = {
  url: string;
  alt: string;
  order: number;
  sourceUrl?: string;
  mediaAssetId?: string;
  width?: number | null;
  height?: number | null;
  contentHash?: string;
};

export type CmsContentPayload = {
  overview: string;
  overviewJson: TipTapDoc;
  specifications: SpecEntry[];
  images: MigratedImage[];
};

export type MatchConfidence =
  | "external_id"
  | "sku"
  | "slug"
  | "unique_name"
  /** @deprecated alias kept for older logs */
  | "source_catalog_id"
  | "source_url";

export type ContentMatchResult = {
  wix: WixProductSnapshot;
  confidence: MatchConfidence;
};

export type ContentMigrationDbRow = {
  slug: string;
  name: string;
  description?: string | null;
  description_json?: unknown;
  source_description?: string | null;
  source_catalog_id?: string | null;
  source_url?: string | null;
  source_fingerprint?: string | null;
  source_images?: unknown;
  image?: unknown;
  hero?: unknown;
  gallery?: unknown;
  specs?: Record<string, string> | null;
  merge_status?: string | null;
  workflow_status?: string | null;
  is_visible?: boolean | null;
  price?: number | null;
  category?: string | null;
};

export type ProductMediaLinkBackup = {
  product_slug: string;
  media_asset_id: string;
  usage: string;
  sort_order: number;
  is_primary: boolean;
  variant_id?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProductContentBackup = {
  version: 1;
  slug: string;
  backed_up_at: string;
  run_id: string;
  product: {
    description: string | null;
    description_json: unknown;
    source_description: string | null;
    source_images: unknown;
    source_fingerprint: string | null;
    source_extracted_at?: string | null;
    specs: Record<string, string> | null;
    image: unknown;
    hero: unknown;
    gallery: unknown;
    workflow_status?: string | null;
  };
  media_links: ProductMediaLinkBackup[];
};

export type ProductMigrationOutcome =
  | "migrated"
  | "skipped"
  | "failed"
  | "dry_run";

export type ProductMigrationLog = {
  slug: string;
  wix_slug: string | null;
  wix_product_id: string | null;
  status: ProductMigrationOutcome;
  reason?: string;
  confidence?: MatchConfidence;
  fingerprint?: string;
  image_count?: number;
  spec_count?: number;
  overview_chars?: number;
  missing_images?: boolean;
  missing_description?: boolean;
  error?: string;
};

export type ContentMigrationReport = {
  version: 1 | 2;
  generated_at: string;
  run_id: string;
  mode: "DRY_RUN" | "APPLIED" | "ANALYSIS" | "VALIDATION" | "MANUAL_REVIEW";
  summary: {
    total_products: number;
    total_wix_products?: number;
    total_supabase_products?: number;
    matched?: number;
    unmatched?: number;
    duplicate_matches?: number;
    migrated: number;
    skipped: number;
    failed: number;
    missing_images: number;
    missing_descriptions: number;
    dry_run: number;
    image_success_rate_pct?: number;
    description_success_rate_pct?: number;
    specification_success_rate_pct?: number;
    overall_success_rate_pct?: number;
    estimated_migration_success_rate_pct?: number;
    pending_review?: number;
  };
  duplicates?: Array<{ wix_product_id: string; db_slugs: string[] }>;
  unmatched_wix?: Array<{ wix_slug: string; name: string }>;
  unmatched_db?: Array<{ slug: string; name: string }>;
  failed_products?: ProductMigrationLog[];
  products: ProductMigrationLog[];
};

export type CheckpointState = {
  version: 1;
  run_id: string;
  created_at: string;
  updated_at: string;
  mode: "DRY_RUN" | "APPLIED";
  fingerprint_by_slug: Record<string, string>;
  completed_slugs: string[];
  failed_slugs: string[];
  last_success_slug: string | null;
  batch_size: number;
};

export type AllowedProductPatch = {
  updated_at: string;
  description?: string;
  description_json?: TipTapDoc;
  source_description?: string;
  source_images?: Array<{ src: string; alt?: string }>;
  source_fingerprint?: string;
  source_extracted_at?: string;
  specs?: Record<string, string>;
  image?: Record<string, unknown>;
  hero?: Record<string, unknown>;
  gallery?: Array<Record<string, unknown>>;
};

export const FORBIDDEN_PATCH_KEYS = [
  "slug",
  "price",
  "compare_at",
  "category",
  "is_visible",
  "variants",
  "bundles",
  "on_sale",
  "discount_type",
  "discount_value",
  "cost_of_goods",
  "tax_rate",
  "tax_group",
  "supplier_id",
  "submitted_by"
] as const;

export const CUTOUT_VARIANT_ID = "catalog-cutout-v1";
export const MIGRATION_BACKUP_VARIANT_ID = "wix-migration-backup-v1";
