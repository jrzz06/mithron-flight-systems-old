import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backupPath, backupsDir } from "./paths.ts";
import type { ContentMigrationDbRow, ProductContentBackup, ProductMediaLinkBackup } from "./types.ts";

export async function createProductContentBackup(
  supabase: SupabaseClient,
  row: ContentMigrationDbRow,
  runId: string
): Promise<ProductContentBackup> {
  const { data: links, error } = await supabase
    .from("product_media_assets")
    .select("product_slug,media_asset_id,usage,sort_order,is_primary,variant_id,alt_text,caption,metadata")
    .eq("product_slug", row.slug);

  if (error) {
    throw new Error(`Failed to read product_media_assets for ${row.slug}: ${error.message}`);
  }

  const backup: ProductContentBackup = {
    version: 1,
    slug: row.slug,
    backed_up_at: new Date().toISOString(),
    run_id: runId,
    product: {
      description: row.description ?? null,
      description_json: row.description_json ?? null,
      source_description: row.source_description ?? null,
      source_images: row.source_images ?? null,
      source_fingerprint: row.source_fingerprint ?? null,
      specs: row.specs ?? null,
      image: row.image ?? null,
      hero: row.hero ?? null,
      gallery: row.gallery ?? null,
      workflow_status: row.workflow_status ?? null
    },
    media_links: (links ?? []) as ProductMediaLinkBackup[]
  };

  mkdirSync(backupsDir(runId), { recursive: true });
  writeFileSync(backupPath(runId, row.slug), `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  return backup;
}

export function readProductContentBackup(runId: string, slug: string): ProductContentBackup | null {
  const path = backupPath(runId, slug);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ProductContentBackup;
}

export async function restoreProductContentBackup(
  supabase: SupabaseClient,
  backup: ProductContentBackup
) {
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("mithron_products")
    .update({
      description: backup.product.description,
      description_json: backup.product.description_json,
      source_description: backup.product.source_description,
      source_images: backup.product.source_images,
      source_fingerprint: backup.product.source_fingerprint,
      specs: backup.product.specs ?? {},
      image: backup.product.image,
      hero: backup.product.hero,
      gallery: backup.product.gallery ?? [],
      ...(backup.product.workflow_status ? { workflow_status: backup.product.workflow_status } : {}),
      updated_at: now
    })
    .eq("slug", backup.slug);

  if (updateError) {
    throw new Error(`Failed to restore product fields for ${backup.slug}: ${updateError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("product_media_assets")
    .delete()
    .eq("product_slug", backup.slug)
    .in("usage", ["primary", "gallery"]);

  if (deleteError) {
    throw new Error(`Failed to clear media links for ${backup.slug}: ${deleteError.message}`);
  }

  const restoreLinks = backup.media_links.filter((link) => link.usage === "primary" || link.usage === "gallery");
  if (restoreLinks.length) {
    const { error: insertError } = await supabase.from("product_media_assets").upsert(
      restoreLinks.map((link) => ({
        product_slug: link.product_slug,
        media_asset_id: link.media_asset_id,
        usage: link.usage,
        sort_order: link.sort_order,
        is_primary: link.is_primary,
        variant_id: link.variant_id ?? null,
        alt_text: link.alt_text ?? null,
        caption: link.caption ?? null,
        metadata: link.metadata ?? {},
        updated_at: now
      })),
      { onConflict: "product_slug,media_asset_id,usage" }
    );
    if (insertError) {
      throw new Error(`Failed to restore media links for ${backup.slug}: ${insertError.message}`);
    }
  }
}
