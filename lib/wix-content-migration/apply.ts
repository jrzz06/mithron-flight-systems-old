import type { SupabaseClient } from "@supabase/supabase-js";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { createProductContentBackup, restoreProductContentBackup } from "./backup.ts";
import { extensionFromMimeType, type ValidatedSourceImage } from "./images.ts";
import { specificationsToRecord } from "./parse-content.ts";
import type {
  AllowedProductPatch,
  CmsContentPayload,
  ContentMigrationDbRow,
  MigratedImage,
  ProductContentBackup
} from "./types.ts";
import { MIGRATION_BACKUP_VARIANT_ID } from "./types.ts";

const BUCKET = "mithron-products";

export function assertPatchIsSafe(patch: Record<string, unknown>) {
  const forbidden = ([
    "slug",
    "price",
    "compare_at",
    "category",
    "workflow_status",
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
  ] as const).filter((key) => key in patch);

  if (forbidden.length) {
    throw new Error(`Forbidden fields in migration patch: ${forbidden.join(", ")}`);
  }
}

export function buildAllowedProductPatch(input: {
  wix: WixProductSnapshot;
  payload: CmsContentPayload;
  hostedImages: MigratedImage[];
}): AllowedProductPatch {
  const replaceDescription = Boolean(input.payload.overview.trim());
  const replaceImages = input.hostedImages.length > 0;
  const replaceSpecs = input.payload.specifications.length > 0;

  if (!replaceDescription && !replaceImages) {
    throw new Error("Refusing to apply empty content patch (no description and no images).");
  }

  const patch: AllowedProductPatch = {
    updated_at: new Date().toISOString(),
    source_fingerprint: input.wix.source_fingerprint,
    source_extracted_at: new Date().toISOString()
  };

  if (replaceDescription) {
    patch.description = input.payload.overview;
    patch.description_json = input.payload.overviewJson;
    patch.source_description = input.wix.description_plain
      || input.payload.overview.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  if (replaceSpecs) {
    patch.specs = specificationsToRecord(input.payload.specifications);
  }

  if (replaceImages) {
    const primary = input.hostedImages[0];
    // Gallery = additional images only (exclude primary). Storefront prepends `image`.
    const gallery = input.hostedImages.slice(1).map((image) => ({
      src: image.url,
      alt: image.alt || input.wix.name,
      kind: "image" as const,
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {})
    }));

    const image = {
      src: primary.url,
      alt: primary.alt || input.wix.name,
      kind: "image" as const,
      priority: true,
      ...(primary.width ? { width: primary.width } : {}),
      ...(primary.height ? { height: primary.height } : {})
    };

    patch.image = image;
    patch.hero = { ...image };
    patch.gallery = gallery;
    // Hosted Supabase URLs only — never leave wixstatic provenance in source_images
    // (catalog.ts treats source_images as a display fallback; media verify flags externals).
    patch.source_images = input.hostedImages.map((imageItem) => ({
      src: imageItem.url,
      alt: imageItem.alt
    }));
  }

  assertPatchIsSafe(patch as unknown as Record<string, unknown>);
  return patch;
}

async function uploadHostedImage(
  supabase: SupabaseClient,
  product: ContentMigrationDbRow,
  image: ValidatedSourceImage
): Promise<MigratedImage> {
  const ext = extensionFromMimeType(image.contentType);
  const storagePath = `products/${product.slug}/wix-content/${image.contentHash}.${ext}`;
  const mediaAssetId = `wix.content.${product.slug}.${image.contentHash}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");

  const { data: existing } = await supabase
    .from("media_assets")
    .select("id,public_url,width,height")
    .eq("id", mediaAssetId)
    .maybeSingle();

  if (existing?.public_url) {
    return {
      url: String(existing.public_url),
      alt: image.alt,
      order: image.order,
      sourceUrl: image.url,
      mediaAssetId: String(existing.id),
      width: existing.width ?? null,
      height: existing.height ?? null,
      contentHash: image.contentHash
    };
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, image.buffer, {
    contentType: image.contentType,
    upsert: true
  });
  if (uploadError) {
    throw new Error(`Storage upload failed for ${product.slug}: ${uploadError.message}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  const now = new Date().toISOString();

  const { error: assetError } = await supabase.from("media_assets").upsert({
    id: mediaAssetId,
    bucket: BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: image.contentType,
    alt: image.alt,
    alt_text: image.alt,
    caption: image.alt,
    folder: `products/${product.slug}`,
    tags: ["wix-content-migration", product.slug, "wix-original"],
    file_size_bytes: image.buffer.byteLength,
    size_bytes: image.buffer.byteLength,
    content_hash: image.contentHash,
    visibility: "public",
    status: "published",
    is_visible: true,
    upload_metadata: {
      source: "wix-content-migration",
      external_source_url: image.url,
      product_slug: product.slug,
      role: "wix-original"
    },
    updated_at: now
  });

  if (assetError) {
    throw new Error(`media_assets upsert failed for ${product.slug}: ${assetError.message}`);
  }

  return {
    url: publicUrl,
    alt: image.alt,
    order: image.order,
    sourceUrl: image.url,
    mediaAssetId,
    contentHash: image.contentHash
  };
}

export async function hostValidatedImages(
  supabase: SupabaseClient,
  product: ContentMigrationDbRow,
  images: ValidatedSourceImage[]
) {
  const hosted: MigratedImage[] = [];
  for (const image of images) {
    hosted.push(await uploadHostedImage(supabase, product, image));
  }
  return hosted;
}

/**
 * Archive previous primary/gallery links under cms + backup variant.
 * Never deletes media_assets rows or Storage objects (cutouts stay until explicit approval).
 */
async function archivePreviousDisplayLinks(
  supabase: SupabaseClient,
  product: ContentMigrationDbRow,
  runId: string
) {
  const { data: existing, error } = await supabase
    .from("product_media_assets")
    .select("product_slug,media_asset_id,usage,sort_order,is_primary,variant_id,alt_text,caption,metadata")
    .eq("product_slug", product.slug)
    .in("usage", ["primary", "gallery"]);

  if (error) {
    throw new Error(`Failed reading display media links for ${product.slug}: ${error.message}`);
  }

  const now = new Date().toISOString();
  for (const link of existing ?? []) {
    const { error: archiveError } = await supabase.from("product_media_assets").upsert(
      {
        product_slug: product.slug,
        media_asset_id: link.media_asset_id,
        usage: "cms",
        variant_id: MIGRATION_BACKUP_VARIANT_ID,
        sort_order: Number(link.sort_order ?? 0),
        is_primary: false,
        alt_text: link.alt_text,
        caption: link.caption,
        metadata: {
          ...(typeof link.metadata === "object" && link.metadata ? link.metadata : {}),
          archived_by: "wix-content-migration",
          previous_usage: link.usage,
          run_id: runId,
          retained_until_manual_approval: true
        },
        updated_at: now
      },
      { onConflict: "product_slug,media_asset_id,usage" }
    );
    if (archiveError) {
      throw new Error(`Failed archiving display media for ${product.slug}: ${archiveError.message}`);
    }
  }
}

async function replaceProductMediaLinks(
  supabase: SupabaseClient,
  product: ContentMigrationDbRow,
  hostedImages: MigratedImage[],
  runId: string
) {
  if (!hostedImages.length) return;

  await archivePreviousDisplayLinks(supabase, product, runId);

  const now = new Date().toISOString();

  // Only detach display usages. Keep cms / catalog-cutout links and all Storage objects.
  const { error: deleteError } = await supabase
    .from("product_media_assets")
    .delete()
    .eq("product_slug", product.slug)
    .in("usage", ["primary", "gallery"]);

  if (deleteError) {
    throw new Error(`Failed detaching old display media links for ${product.slug}: ${deleteError.message}`);
  }

  const rows = hostedImages.map((image, index) => ({
    product_slug: product.slug,
    media_asset_id: image.mediaAssetId!,
    usage: index === 0 ? "primary" : "gallery",
    sort_order: index,
    is_primary: index === 0,
    alt_text: image.alt || product.name,
    caption: image.alt || product.name,
    metadata: {
      source: "wix-content-migration",
      public_url: image.url,
      external_source_url: image.sourceUrl ?? null,
      content_hash: image.contentHash ?? null,
      role: "wix-original",
      run_id: runId
    },
    updated_at: now
  }));

  const { error: insertError } = await supabase.from("product_media_assets").insert(rows);
  if (insertError) {
    throw new Error(`Failed inserting Wix display media links for ${product.slug}: ${insertError.message}`);
  }
}

export async function validateMigratedProduct(
  supabase: SupabaseClient,
  slug: string,
  expectations: { hasDescription: boolean; hasImages: boolean; hasSpecs: boolean }
) {
  const { data: row, error } = await supabase
    .from("mithron_products")
    .select("slug,description,description_json,specs,image,hero,gallery,workflow_status")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !row) {
    return { ok: false as const, reason: error?.message || "product_missing_after_update" };
  }

  if (expectations.hasDescription) {
    const description = String(row.description ?? "").trim();
    if (!description) return { ok: false as const, reason: "description_empty_after_update" };
    const json = row.description_json as { type?: string } | null;
    if (json && json.type !== "doc") return { ok: false as const, reason: "description_json_invalid" };
  }

  if (expectations.hasSpecs) {
    if (!row.specs || typeof row.specs !== "object" || Array.isArray(row.specs)) {
      return { ok: false as const, reason: "specs_invalid_after_update" };
    }
  }

  if (expectations.hasImages) {
    const imageSrc = row.image && typeof row.image === "object" ? String((row.image as { src?: string }).src ?? "") : "";
    if (!imageSrc || /wixstatic\.com/i.test(imageSrc)) {
      return { ok: false as const, reason: "primary_image_invalid_after_update" };
    }
    const { data: links, error: linkError } = await supabase
      .from("product_media_assets")
      .select("usage,is_primary")
      .eq("product_slug", slug)
      .in("usage", ["primary", "gallery"]);
    if (linkError) return { ok: false as const, reason: linkError.message };
    if (!(links ?? []).some((link) => link.usage === "primary" || link.is_primary)) {
      return { ok: false as const, reason: "missing_primary_media_link" };
    }
  }

  return { ok: true as const };
}

export async function applyProductContentMigration(input: {
  supabase: SupabaseClient;
  row: ContentMigrationDbRow;
  wix: WixProductSnapshot;
  payload: CmsContentPayload;
  validatedImages: ValidatedSourceImage[];
  runId: string;
}): Promise<{ patch: AllowedProductPatch; hostedImages: MigratedImage[]; backup: ProductContentBackup }> {
  const backup = await createProductContentBackup(input.supabase, input.row, input.runId);

  let hostedImages: MigratedImage[] = [];
  try {
    if (input.validatedImages.length) {
      hostedImages = await hostValidatedImages(input.supabase, input.row, input.validatedImages);
    }

    const patch = buildAllowedProductPatch({
      wix: input.wix,
      payload: input.payload,
      hostedImages
    });

    const { error: updateError } = await input.supabase
      .from("mithron_products")
      .update(patch)
      .eq("slug", input.row.slug);

    if (updateError) {
      throw new Error(`Product update failed for ${input.row.slug}: ${updateError.message}`);
    }

    if (hostedImages.length) {
      await replaceProductMediaLinks(input.supabase, input.row, hostedImages, input.runId);
    }

    const validation = await validateMigratedProduct(input.supabase, input.row.slug, {
      hasDescription: Boolean(input.payload.overview.trim()),
      hasImages: hostedImages.length > 0,
      hasSpecs: input.payload.specifications.length > 0
    });

    if (!validation.ok) {
      throw new Error(`Post-migration validation failed for ${input.row.slug}: ${validation.reason}`);
    }

    return { patch, hostedImages, backup };
  } catch (error) {
    try {
      await restoreProductContentBackup(input.supabase, backup);
    } catch (restoreError) {
      const applyMessage = error instanceof Error ? error.message : String(error);
      const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
      throw new Error(`Apply failed (${applyMessage}); restore also failed (${restoreMessage})`);
    }
    throw error;
  }
}

export async function applyProductContentDryRunPreview(input: {
  wix: WixProductSnapshot;
  payload: CmsContentPayload;
  validatedImages: ValidatedSourceImage[];
}) {
  const previewImages: MigratedImage[] = input.validatedImages.map((image) => ({
    url: `https://example.supabase.co/storage/v1/object/public/${BUCKET}/products/preview/${image.contentHash}.${extensionFromMimeType(image.contentType)}`,
    alt: image.alt,
    order: image.order,
    sourceUrl: image.url,
    mediaAssetId: `preview.${image.contentHash}`,
    contentHash: image.contentHash
  }));

  return buildAllowedProductPatch({
    wix: input.wix,
    payload: input.payload,
    hostedImages: previewImages
  });
}
