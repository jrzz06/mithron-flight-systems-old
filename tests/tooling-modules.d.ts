declare module "*.mjs" {
  export const PRODUCT_SOURCE_ALIASES: Readonly<Record<string, string>>;
  export function buildCanonicalMediaBackfill(input: {
    assets: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    supabaseUrl: string;
    at?: string;
  }): {
    mediaAssets: Array<Record<string, unknown> & {
      upload_metadata?: Record<string, unknown>;
      responsive_variants?: {
        variants?: Record<string, unknown[]>;
      };
    }>;
    productMediaAssets: Array<Record<string, unknown> & {
      metadata?: Record<string, unknown>;
    }>;
    unresolvedProductLinks: Array<Record<string, unknown>>;
    summary: Record<string, unknown>;
  };
  export function buildOperationalSeedRows(input?: {
    existingWarehouseStockId?: string | null;
  }): Record<string, Array<Record<string, unknown>>>;
  export function parseCliArgs(argv: string[]): {
    apply: boolean;
    json: boolean;
    limit?: number;
  };
  export function summarizeSeedRows(rows: Record<string, Array<Record<string, unknown>>>): Record<string, number>;
}
