"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { getProductManagerSnapshot, fetchProductEditorDetail } from "@/services/admin";
import {
  buildProductCategoryMetadataFromFormData,
  buildProductDraftFromFormData,
  buildProductDeleteFromFormData,
  buildProductForceDeleteFromFormData,
  buildProductRemoveFromFormData,
  buildProductMediaLinkFromFormData,
  buildProductPublishStateFromFormData,
  buildProductQuickEditFromFormData,
  buildProductSeoDraftFromFormData,
  buildProductVariantsWorkflowFromFormData
} from "@/services/product-admin-forms";
import {
  createActivityLogRecord,
  deleteAdminRecord,
  deleteOrArchiveProduct,
  getProductDeletionBlockers,
  recordEntityRevisionSnapshot,
  upsertAdminRecord,
  AdminRecordConflictError,
  updateAdminRecord,
  updateProductPublicationRecord,
  upsertProductMediaAssetRecord,
  upsertProductRecord,
  setProductMediaPrimaryViaRpc
} from "@/services/admin-actions";
import { getCurrentAuthContext, requireAdminPermission, requirePermission } from "@/services/auth";
import {
  parseProductCreateInventoryFromFormData,
  saveProductInventory
} from "@/services/product-inventory-workflow";
import { buildProductInventoryWorkflowFromFormData } from "@/services/enterprise-admin-forms";
import { markProductPublished } from "@/services/product-publish";
import { appendBundlePricingSync } from "@/lib/catalog-pricing";
import { revalidateCatalogSurfaces } from "@/lib/catalog-cache";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { isNextRedirect } from "@/lib/server-action-feedback";
import {
  buildProductGalleryMedia,
  hasAnyProductImageInput,
  linkUploadedImagesToProduct,
  parseGalleryUrls,
  parseRemovedGalleryUrls,
  readMediaSrc,
  readProductGalleryFromRow
} from "@/lib/product-gallery";
import {
  ensureProductMediaLinksForProduct,
  unlinkRemovedProductMedia
} from "@/lib/product-media-cleanup";
import { uploadProductImagesForDraft } from "@/services/product-image-upload";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import type { ProductCatalogGridRow } from "@/app/admin/products/product-catalog-grid";

async function currentActorContext() {
  const context = await getCurrentAuthContext();
  return {
    actorId: context.userId,
    actorRole: context.role
  };
}

async function recordProductAuditTrail(input: {
  action: string;
  entityTable: string;
  entityId: string;
  snapshot: Record<string, unknown>;
  actorId: string | null;
  actorRole: string | null;
  changeSummary?: string | null;
  severity?: "info" | "warning";
  metadata?: Record<string, unknown>;
}) {
  await recordEntityRevisionSnapshot(
    input.entityTable,
    input.entityId,
    {
      ...input.snapshot,
      audit_context: {
        action: input.action,
        actor_role: input.actorRole,
        ...(input.metadata ?? {})
      }
    },
    input.actorId,
    input.changeSummary ?? input.action
  );

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: input.action,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      severity: input.severity ?? "info",
      metadata: {
        actor_role: input.actorRole,
        change_summary: input.changeSummary ?? null,
        ...(input.metadata ?? {})
      }
    },
    input.actorId
  );
}

function productActionErrorMessage(error: unknown) {
  if (isNextRedirect(error)) throw error;
  if (error instanceof AdminRecordConflictError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function readOptionalFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeCategoryName(value: string) {
  return value.trim().toLowerCase();
}

async function runProductAction(
  options: {
    successMessage?: string;
    tool?: string;
    anchor?: string;
    actionKind?: string;
  },
  action: () => Promise<string | void>
) {
  await requirePermission("products.write");
  let status: "success" | "error" = "success";
  let message = options.successMessage ?? "Saved.";

  try {
    const dynamicMessage = await action();
    if (typeof dynamicMessage === "string") {
      message = dynamicMessage;
    }
    await revalidateAfterMutation("mithron_products");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    status = "error";
    message = productActionErrorMessage(error);
  }

  const params = new URLSearchParams({
    product_status: status,
    product_message: message.slice(0, 240)
  });
  if (options.tool) params.set("tool", options.tool);
  if (options.actionKind) params.set("product_action", options.actionKind);

  redirect(`/admin/products?${params.toString()}${options.anchor ? `#${options.anchor}` : ""}`);
}

export async function saveProductDraftFormAction(formData: FormData) {
  await runProductAction({ successMessage: FEEDBACK_MESSAGES.productCreated }, async () => {
    const { actorId, actorRole } = await currentActorContext();
    const uploadedImages = await uploadProductImagesForDraft(formData, actorId, "admin-product-create", {
      applyAutoCutout: true
    });
    if (!hasAnyProductImageInput(formData, uploadedImages.length)) {
      throw new Error("Add an image by uploading a local file or pasting an image URL.");
    }
    const draftInput = buildProductDraftFromFormData(formData);
    const productName = String(draftInput.fields.name ?? "");
    const mergedGallery = buildProductGalleryMedia({
      primarySrc: readOptionalFormText(formData, "image_src"),
      primaryAlt: productName,
      uploadedUrls: uploadedImages.map((upload) => upload.publicUrl),
      extraUrls: parseGalleryUrls(formData)
    });
    if (mergedGallery) {
      draftInput.fields.image = mergedGallery.image;
      draftInput.fields.hero = mergedGallery.hero;
      draftInput.fields.gallery = mergedGallery.gallery;
    }
    // Description is already sanitized (not rewritten) in
    // buildProductDraftFromFormData -> readProductCommerceFields via
    // prepareEditorHtmlForSave, so an admin-authored description is saved
    // exactly as written. The deterministic/AI normalization pipeline is
    // intentionally not run automatically here - the RichTextEditor's own
    // "Improve with AI" action remains available on demand.
    const record = await upsertProductRecord(
      {
        slug: draftInput.identity.slug,
        workflow_status: "draft",
        is_visible: false,
        sort_order: draftInput.sortOrder ?? 0,
        ...draftInput.fields
      },
      actorId
    );
    const inventoryInput = parseProductCreateInventoryFromFormData(formData, draftInput.identity.slug);
    if (inventoryInput) {
      if (!actorId) throw new Error("Authentication required.");
      await saveProductInventory(inventoryInput, actorId, {
        actorRole,
        auditAction: "products.inventory_init"
      });
    }
    let imageLinkWarning: string | null = null;
    if (uploadedImages.length) {
      // The product record above is already committed at this point - if
      // linking the uploaded images to product_media_assets fails, the save
      // itself must not be reported as failed (that would mislead the admin
      // into resubmitting a product that already exists). Instead, surface a
      // clear warning so the missing responsive delivery isn't silent.
      try {
        await linkUploadedImagesToProduct(draftInput.identity.slug, uploadedImages, {
          name: productName,
          source: "admin-product-create",
          actorId
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[admin-products] failed to link uploaded images for ${draftInput.identity.slug}: ${message}`);
        imageLinkWarning = `Product created, but linking uploaded images failed (${message}). Re-open the product and re-save the images.`;
      }
    }

    try {
      await ensureProductMediaLinksForProduct({
        productSlug: draftInput.identity.slug,
        productName,
        media: {
          image: record.image ?? draftInput.fields.image,
          hero: record.hero ?? draftInput.fields.hero,
          gallery: record.gallery ?? draftInput.fields.gallery
        },
        actorId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[admin-products] failed to sync media links for ${draftInput.identity.slug}: ${message}`);
      imageLinkWarning = imageLinkWarning
        ? `${imageLinkWarning} Media link sync also failed (${message}).`
        : `Product created, but media link sync failed (${message}).`;
    }
    await recordProductAuditTrail(
      {
        action: "products.draft",
        entityTable: "mithron_products",
        entityId: draftInput.identity.slug,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary,
        metadata: {
          product_slug: draftInput.identity.slug,
          workflow_status: "draft",
          uploaded_media_asset_ids: uploadedImages.map((upload) => upload.mediaAssetId),
          image_link_failed: Boolean(imageLinkWarning)
        }
      }
    );
    revalidatePath("/admin/products");
    return imageLinkWarning ?? undefined;
  });
}

export async function saveProductDuplicateFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Product duplicated as a draft." }, async () => {
    const sourceSlug = String(formData.get("product_slug") ?? "").trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceSlug)) {
      throw new Error("Product duplicate product_slug must use lowercase letters, numbers, and hyphens only.");
    }

    const { actorId, actorRole } = await currentActorContext();
    const snapshot = await getProductManagerSnapshot();
    const sourceProduct = snapshot.data.products.find((product) => String(product.slug ?? "") === sourceSlug);
    if (!sourceProduct) {
      throw new Error(`Product ${sourceSlug} does not exist or cannot be duplicated.`);
    }

    const now = new Date().toISOString();
    const copySlug = `${sourceSlug}-copy-${Date.now().toString(36)}`;
    const record = await upsertProductRecord(
      {
        ...sourceProduct,
        slug: copySlug,
        name: `${String(sourceProduct.name ?? sourceSlug)} Copy`,
        workflow_status: "draft",
        is_visible: false,
        published_at: null,
        archived_at: null,
        sort_order: Number(sourceProduct.sort_order ?? 0) + 1,
        updated_at: now
      },
      actorId
    );

    await recordProductAuditTrail(
      {
        action: "products.duplicate",
        entityTable: "mithron_products",
        entityId: copySlug,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: `Duplicate product ${sourceSlug}`,
        metadata: {
          source_product_slug: sourceSlug,
          duplicate_product_slug: copySlug
        }
      }
    );

    revalidatePath("/admin/products");
  });
}

export async function saveProductCategoryFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Category added.", tool: "category", anchor: "product-category" }, async () => {
    const categoryInput = buildProductCategoryMetadataFromFormData(formData);
    const snapshot = await getProductManagerSnapshot();
    const normalizedTitle = normalizeCategoryName(categoryInput.fields.title);
    const existingCategory = snapshot.data.categories.find((category) => {
      const routeKey = String(category.route_key ?? "").trim();
      const title = String(category.title ?? "").trim();
      return routeKey === categoryInput.identity.route_key || normalizeCategoryName(title) === normalizedTitle;
    });
    if (existingCategory) {
      throw new Error(`Category "${categoryInput.fields.title}" already exists.`);
    }

    const { actorId, actorRole } = await currentActorContext();
    const record = await upsertAdminRecord(
      "category_metadata",
      "route_key",
      {
        route_key: categoryInput.identity.route_key,
        sort_order: categoryInput.sortOrder ?? (snapshot.data.categories.length + 1) * 10,
        ...categoryInput.fields
      },
      actorId
    );

    await recordProductAuditTrail(
      {
        action: "products.category_create",
        entityTable: "category_metadata",
        entityId: categoryInput.identity.route_key,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: categoryInput.changeSummary,
        metadata: {
          route_key: categoryInput.identity.route_key,
          category_title: categoryInput.fields.title
        }
      }
    );

    revalidatePath("/admin/products");
    revalidatePath("/products");
  });
}

export async function deleteProductCategoryFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Category deleted." }, async () => {
    const categoryTitle = readOptionalFormText(formData, "category");
    const requestedRouteKey = readOptionalFormText(formData, "category_route_key");
    if (!categoryTitle) {
      throw new Error("Choose a category before deleting it.");
    }

    const snapshot = await getProductManagerSnapshot();
    const normalizedCategory = normalizeCategoryName(categoryTitle);
    const productsUsingCategory = snapshot.data.products.filter((product) => normalizeCategoryName(String(product.category ?? "")) === normalizedCategory);
    if (productsUsingCategory.length > 0) {
      throw new Error(`Category "${categoryTitle}" is used by ${productsUsingCategory.length} product(s). Move or edit those products before deleting the category.`);
    }

    const categoryRecord = snapshot.data.categories.find((category) => {
      const routeKey = String(category.route_key ?? "");
      const title = String(category.title ?? "");
      return (requestedRouteKey && routeKey === requestedRouteKey) || normalizeCategoryName(title) === normalizedCategory;
    });
    if (!categoryRecord) {
      throw new Error(`Category "${categoryTitle}" has no category_metadata row to delete.`);
    }

    const routeKey = String(categoryRecord.route_key ?? "").trim();
    if (!routeKey) {
      throw new Error(`Category "${categoryTitle}" has no route key in category_metadata.`);
    }

    const { actorId, actorRole } = await currentActorContext();
    const record = await deleteAdminRecord("category_metadata", "route_key", routeKey, actorId);
    await recordProductAuditTrail(
      {
        action: "products.category_delete",
        entityTable: "category_metadata",
        entityId: routeKey,
        snapshot: {
          ...record,
          category_title: categoryTitle
        },
        actorId,
        actorRole,
        severity: "warning",
        changeSummary: `Delete unused category ${categoryTitle}`,
        metadata: {
          route_key: routeKey,
          category_title: categoryTitle,
          products_using_category: productsUsingCategory.length
        }
      }
    );

    revalidatePath("/admin/products");
  });
}

/**
 * Shared quick-edit mutation body. Returns an optional warning string when the
 * product row saved but a secondary media-link step failed.
 * Throws on hard failure. Does NOT redirect — callers decide feedback style.
 */
async function performProductQuickEdit(formData: FormData): Promise<string | undefined> {
  await requirePermission("products.write");
  const quickInput = buildProductQuickEditFromFormData(formData);
  // Same reasoning as product creation: readProductCommerceFields already
  // sanitizes (not rewrites) the description, so a manually-edited
  // description is preserved as typed. No automatic re-normalization here.
  const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
  const { actorId, actorRole } = await currentActorContext();
  const snapshot = await getProductManagerSnapshot();
  const existingProduct = snapshot.data.products.find((product) => String(product.slug ?? "") === quickInput.identity.slug);
  const uploadedImages = await uploadProductImagesForDraft(formData, actorId, "admin-product-quick-edit", {
    applyAutoCutout: true
  });
  const productName = String(quickInput.fields.name ?? existingProduct?.name ?? quickInput.identity.slug);
  const removedUrls = parseRemovedGalleryUrls(formData);

  if (hasAnyProductImageInput(formData, uploadedImages.length)) {
    const existingPrimarySrc = existingProduct
      ? readMediaSrc(existingProduct.image) || readMediaSrc(existingProduct.hero)
      : "";
    const mergedGallery = buildProductGalleryMedia({
      primarySrc: readOptionalFormText(formData, "image_src") || existingPrimarySrc,
      primaryAlt: productName,
      uploadedUrls: uploadedImages.map((upload) => upload.publicUrl),
      extraUrls: parseGalleryUrls(formData),
      existingGallery: existingProduct ? readProductGalleryFromRow(existingProduct) : [],
      removedUrls
    });
    if (mergedGallery) {
      quickInput.fields.image = mergedGallery.image;
      quickInput.fields.hero = mergedGallery.hero;
      quickInput.fields.gallery = mergedGallery.gallery;
    }
  }

  const fields = appendBundlePricingSync(
    { ...quickInput.fields } as Record<string, unknown>,
    existingProduct as Record<string, unknown> | undefined
  );
  const record = await updateAdminRecord(
    "mithron_products",
    "slug",
    quickInput.identity.slug,
    {
      ...fields,
      updated_at: new Date().toISOString()
    },
    actorId,
    process.env,
    { expectedUpdatedAt }
  );

  let imageLinkWarning: string | null = null;
  if (uploadedImages.length) {
    // Same reasoning as the create action: the product update above is
    // already committed, so a media-link failure must surface as a clear
    // warning rather than throwing (which would misreport a completed save
    // as a hard failure) or being silently dropped (which would leave the
    // primary image missing responsive delivery with no admin-facing signal).
    try {
      await linkUploadedImagesToProduct(quickInput.identity.slug, uploadedImages, {
        name: productName,
        source: "admin-product-quick-edit",
        actorId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[admin-products] failed to link uploaded images for ${quickInput.identity.slug}: ${message}`);
      imageLinkWarning = `Product updated, but linking uploaded images failed (${message}). Re-open the product and re-save the images.`;
    }
  }

  if (removedUrls.length) {
    try {
      await unlinkRemovedProductMedia({
        productSlug: quickInput.identity.slug,
        removedUrls,
        actorId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[admin-products] failed to unlink removed images for ${quickInput.identity.slug}: ${message}`);
      imageLinkWarning = imageLinkWarning
        ? `${imageLinkWarning} Removed image cleanup also failed (${message}).`
        : `Product updated, but removed image cleanup failed (${message}).`;
    }
  }

  try {
    await ensureProductMediaLinksForProduct({
      productSlug: quickInput.identity.slug,
      productName,
      media: {
        image: record.image ?? quickInput.fields.image,
        hero: record.hero ?? quickInput.fields.hero,
        gallery: record.gallery ?? quickInput.fields.gallery
      },
      actorId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[admin-products] failed to sync media links for ${quickInput.identity.slug}: ${message}`);
    imageLinkWarning = imageLinkWarning
      ? `${imageLinkWarning} Media link sync also failed (${message}).`
      : `Product updated, but media link sync failed (${message}).`;
  }

  await recordProductAuditTrail(
    {
      action: "products.quick_edit",
      entityTable: "mithron_products",
      entityId: quickInput.identity.slug,
      snapshot: record as Record<string, unknown>,
      actorId,
      actorRole,
      changeSummary: quickInput.changeSummary,
      metadata: {
        product_slug: quickInput.identity.slug,
        fields: Object.keys(quickInput.fields),
        uploaded_media_asset_ids: uploadedImages.map((upload) => upload.mediaAssetId),
        image_link_failed: Boolean(imageLinkWarning)
      }
    }
  );

  await revalidateCatalogSurfaces(quickInput.identity.slug);
  revalidatePath("/admin/products");
  return imageLinkWarning ?? undefined;
}

/** Full-page form action — redirects with feedback query params. */
export async function saveProductQuickEditFormAction(formData: FormData) {
  await runProductAction({ successMessage: FEEDBACK_MESSAGES.productUpdated }, async () => {
    return performProductQuickEdit(formData);
  });
}

/**
 * In-place modal bridge — returns `{ ok, message }` so the client can clear
 * pending state without waiting on a NEXT_REDIRECT flight that never settles
 * inside a modal (the root cause of stuck "Saving...").
 */
export async function saveProductQuickEditClientAction(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  try {
    const warning = await performProductQuickEdit(formData);
    await revalidateAfterMutation("mithron_products");
    return {
      ok: true,
      message: warning ?? FEEDBACK_MESSAGES.productUpdated
    };
  } catch (error) {
    return {
      ok: false,
      message: productActionErrorMessage(error)
    };
  }
}

function readEditorGalleryItems(gallery: unknown): Array<{ src: string; alt?: string }> {
  if (!Array.isArray(gallery)) return [];
  const items: Array<{ src: string; alt?: string }> = [];
  const seen = new Set<string>();
  for (const item of gallery) {
    const src = readMediaSrc(item);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const alt = item && typeof item === "object" && !Array.isArray(item)
      ? String((item as Record<string, unknown>).alt ?? "").trim()
      : "";
    items.push({ src, ...(alt ? { alt } : {}) });
  }
  return items;
}

function mapProductEditorDetailToGridRow(
  row: Record<string, unknown>,
  base?: ProductCatalogGridRow
): ProductCatalogGridRow {
  const slug = String(row.slug ?? base?.id ?? "");
  const primarySrc = readMediaSrc(row.image) || readMediaSrc(row.hero) || base?.thumbnailSrc || "";
  const galleryItems = readEditorGalleryItems(row.gallery);
  const galleryUrls = galleryItems
    .map((item) => item.src)
    .filter((src) => src !== primarySrc);
  const descriptionJson =
    row.description_json && typeof row.description_json === "object" && !Array.isArray(row.description_json)
      ? (row.description_json as Record<string, unknown>)
      : null;
  const specs =
    row.specs && typeof row.specs === "object" && !Array.isArray(row.specs)
      ? Object.fromEntries(
          Object.entries(row.specs as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])
        )
      : {};

  return {
    id: slug || base?.id || "product",
    title: String(row.name ?? base?.title ?? slug),
    tagline: row.tagline != null ? String(row.tagline) : base?.tagline ?? null,
    category: String(row.category ?? base?.category ?? "Uncategorized"),
    status: String(row.workflow_status ?? base?.status ?? "published"),
    thumbnailSrc: resolveNextImageSrc(primarySrc) || base?.thumbnailSrc || null,
    price: String(row.price ?? base?.price ?? "0"),
    compareAt: row.compare_at != null ? String(row.compare_at) : base?.compareAt ?? null,
    badge: row.badge_text ? String(row.badge_text) : base?.badge ?? null,
    badgeEnabled: Boolean(row.badge_text && String(row.badge_text).trim()),
    badgeText: row.badge_text ? String(row.badge_text) : null,
    badgeStyle: row.badge_style ? String(row.badge_style) : null,
    galleryUrls,
    galleryItems,
    description: row.description != null ? String(row.description) : "",
    descriptionJson,
    specs,
    onSale: Boolean(row.on_sale),
    discountType: row.discount_type === "percent"
      ? ("percent" as const)
      : row.discount_type === "amount"
        ? ("amount" as const)
        : null,
    discountValue: row.discount_value != null ? String(row.discount_value) : null,
    costOfGoods: row.cost_of_goods != null ? String(row.cost_of_goods) : null,
    showPricePerUnit: Boolean(row.show_price_per_unit),
    chargeTax: row.charge_tax !== false,
    taxGroup: row.tax_group ? String(row.tax_group) : "products-default",
    taxRate: row.tax_rate != null ? String(row.tax_rate) : null,
    taxIncluded: Boolean(row.tax_included),
    stockQuantity: base?.stockQuantity ?? "0",
    stockStatus: base?.stockStatus ?? "unlinked",
    checkoutWarehouseCode: base?.checkoutWarehouseCode,
    sourceAvailability: String(row.source_availability ?? base?.sourceAvailability ?? ""),
    isVisible: row.is_visible !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : base?.updatedAt ?? null
  };
}

/**
 * Load full product editor fields (description, description_json, specs, gallery)
 * for the quick-edit modal. Catalog list rows intentionally omit these.
 */
export async function fetchProductEditorDetailForQuickEditAction(
  productSlug: string
): Promise<{ ok: true; product: ProductCatalogGridRow } | { ok: false; message: string }> {
  try {
    await requirePermission("products.write");
    const slug = productSlug.trim();
    if (!slug) {
      return { ok: false, message: "Product slug is required." };
    }
    const row = await fetchProductEditorDetail(slug);
    if (!row) {
      return { ok: false, message: "Product not found." };
    }
    return {
      ok: true,
      product: mapProductEditorDetailToGridRow(row as Record<string, unknown>)
    };
  } catch (error) {
    return {
      ok: false,
      message: productActionErrorMessage(error)
    };
  }
}

export async function saveProductMediaLinkFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Product media link saved." }, async () => {
    const draftInput = buildProductMediaLinkFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const record = draftInput.fields.is_primary
      ? await setProductMediaPrimaryViaRpc(
        draftInput.identity.product_slug,
        draftInput.identity.media_asset_id,
        draftInput.identity.usage,
        actorId
      )
      : await upsertProductMediaAssetRecord(
        {
          product_slug: draftInput.identity.product_slug,
          media_asset_id: draftInput.identity.media_asset_id,
          usage: draftInput.identity.usage,
          ...draftInput.fields,
          updated_at: new Date().toISOString()
        },
        actorId
      );
    await recordProductAuditTrail(
      {
        action: "products.media_link",
        entityTable: "product_media_assets",
        entityId: draftInput.entityId,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary,
        metadata: {
          product_slug: draftInput.identity.product_slug,
          media_asset_id: draftInput.identity.media_asset_id,
          usage: draftInput.identity.usage
        }
      }
    );
    await revalidateCatalogSurfaces(draftInput.identity.product_slug);
    revalidatePath("/admin/products");
  });
}

export async function saveProductVariantsFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Product variants saved." }, async () => {
    const draftInput = buildProductVariantsWorkflowFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const record = await updateAdminRecord(
      "mithron_products",
      "slug",
      draftInput.identity.slug,
      {
        variants: draftInput.fields.variants,
        updated_at: new Date().toISOString()
      },
      actorId
    );
    await recordProductAuditTrail(
      {
        action: "products.variants",
        entityTable: "mithron_products",
        entityId: draftInput.identity.slug,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary,
        metadata: {
          product_slug: draftInput.identity.slug,
          variant_count: draftInput.fields.variants.length
        }
      }
    );
    await revalidateCatalogSurfaces(draftInput.identity.slug);
    revalidatePath("/admin/products");
  });
}

export async function saveProductSeoFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Product SEO saved." }, async () => {
    const draftInput = buildProductSeoDraftFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const record = await updateAdminRecord(
      "mithron_products",
      "slug",
      draftInput.identity.slug,
      {
        ...draftInput.fields,
        updated_at: new Date().toISOString()
      },
      actorId
    );
    await recordProductAuditTrail(
      {
        action: "products.seo",
        entityTable: "mithron_products",
        entityId: draftInput.identity.slug,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary,
        metadata: {
          product_slug: draftInput.identity.slug,
          seo_fields: Object.keys(draftInput.fields)
        }
      }
    );
    await revalidateCatalogSurfaces(draftInput.identity.slug);
    revalidatePath("/admin/products");
  });
}

export async function saveProductPublishStateFormAction(formData: FormData) {
  await runProductAction({ successMessage: "Product publish state saved." }, async () => {
    const draftInput = buildProductPublishStateFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const now = new Date().toISOString();
    const isPublished = draftInput.fields.workflow_status === "published";
    const isArchived = draftInput.fields.workflow_status === "archived";
    const record = isPublished
      ? await markProductPublished(draftInput.identity.slug, actorId, {
          is_visible: draftInput.fields.is_visible
        })
      : await updateProductPublicationRecord(
          {
            slug: draftInput.identity.slug,
            workflow_status: draftInput.fields.workflow_status,
            is_visible: false,
            published_at: null,
            archived_at: isArchived ? now : null,
            updated_at: now
          },
          actorId
        );

    await recordProductAuditTrail(
      {
        action: "products.publish",
        entityTable: "mithron_products",
        entityId: draftInput.identity.slug,
        snapshot: record as Record<string, unknown>,
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary ?? `Set product ${draftInput.identity.slug} to ${draftInput.fields.workflow_status}`,
        severity: isArchived ? "warning" : "info",
        metadata: {
          product_slug: draftInput.identity.slug,
          workflow_status: draftInput.fields.workflow_status,
          is_visible: isPublished ? draftInput.fields.is_visible : false
        }
      }
    );

    await revalidateCatalogSurfaces(draftInput.identity.slug);
    revalidatePath("/admin/products");
    revalidatePath("/admin/inventory");
    revalidatePath("/warehouse/inventory");
  });
}

export async function previewProductDeleteAction(slug: string) {
  await requirePermission("products.write");
  const normalizedSlug = String(slug ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    throw new Error("Product slug must use lowercase letters, numbers, and hyphens only.");
  }
  return getProductDeletionBlockers(normalizedSlug);
}

export async function saveProductRemoveFormAction(formData: FormData) {
  await runProductAction({ actionKind: "remove" }, async () => {
    const removeInput = buildProductRemoveFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const result = await deleteOrArchiveProduct(removeInput.identity.slug, actorId, { mode: "auto" });
    const isArchived = result.outcome === "archived";

    await recordProductAuditTrail(
      {
        action: isArchived ? "products.archive" : "products.hard_delete",
        entityTable: "mithron_products",
        entityId: removeInput.identity.slug,
        snapshot: isArchived
          ? {
              product_slug: removeInput.identity.slug,
              blockers: result.blockers,
              before_data: result.beforeData,
              record: result.record
            }
          : {
              product_slug: removeInput.identity.slug,
              deleted_dependencies: result.deletedDependencies,
              before_data: result.beforeData,
              blockers: result.blockers
            },
        actorId,
        actorRole,
        changeSummary: removeInput.changeSummary,
        severity: "warning",
        metadata: {
          product_slug: removeInput.identity.slug,
          delete_mode: isArchived ? "auto_archive" : "auto_hard_delete",
          blockers: result.blockers,
          ...(isArchived ? {} : { deleted_dependencies: result.deletedDependencies })
        }
      }
    );

    await revalidateCatalogSurfaces(removeInput.identity.slug);
    revalidatePath("/admin/products");
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/admin/inventory");
    revalidatePath("/warehouse/inventory");

    return isArchived ? "Product archived." : "Product permanently deleted.";
  });
}

export async function saveProductHardDeleteFormAction(formData: FormData) {
  await runProductAction({ actionKind: "permanent_delete" }, async () => {
    const deleteInput = buildProductDeleteFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const result = await deleteOrArchiveProduct(deleteInput.identity.slug, actorId, { mode: "hard" });
    if (result.outcome === "archived") {
      throw new Error("Product could not be permanently deleted.");
    }

    await recordProductAuditTrail(
      {
        action: "products.hard_delete",
        entityTable: "mithron_products",
        entityId: deleteInput.identity.slug,
        snapshot: {
          product_slug: deleteInput.identity.slug,
          deleted_dependencies: result.deletedDependencies,
          before_data: result.beforeData,
          blockers: result.blockers
        },
        actorId,
        actorRole,
        changeSummary: deleteInput.changeSummary,
        severity: "warning",
        metadata: {
          product_slug: deleteInput.identity.slug,
          delete_mode: "permanent_delete",
          deleted_dependencies: result.deletedDependencies,
          blockers: result.blockers
        }
      }
    );

    await revalidateCatalogSurfaces(deleteInput.identity.slug);
    revalidatePath("/admin/products");
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/admin/inventory");
    revalidatePath("/warehouse/inventory");

    return "Product permanently deleted.";
  });
}

export async function saveProductForceDeleteFormAction(formData: FormData) {
  await runProductAction({ actionKind: "permanent_delete" }, async () => {
    await requireAdminPermission("products.permanent_delete");
    const deleteInput = buildProductForceDeleteFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    const result = await deleteOrArchiveProduct(deleteInput.identity.slug, actorId, { mode: "force_hard" });
    if (result.outcome === "archived") {
      throw new Error("Product could not be force deleted.");
    }

    await recordProductAuditTrail(
      {
        action: "products.hard_delete",
        entityTable: "mithron_products",
        entityId: deleteInput.identity.slug,
        snapshot: {
          product_slug: deleteInput.identity.slug,
          deleted_dependencies: result.deletedDependencies,
          before_data: result.beforeData,
          blockers: result.blockers,
          force_delete: true
        },
        actorId,
        actorRole,
        changeSummary: deleteInput.changeSummary,
        severity: "warning",
        metadata: {
          product_slug: deleteInput.identity.slug,
          delete_mode: "force_hard_delete",
          deleted_dependencies: result.deletedDependencies,
          blockers: result.blockers,
          force_delete: true
        }
      }
    );

    await revalidateCatalogSurfaces(deleteInput.identity.slug);
    revalidatePath("/admin/products");
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/admin/inventory");
    revalidatePath("/warehouse/inventory");

    return "Product force deleted.";
  });
}

export async function saveProductInventoryWorkflowFormAction(formData: FormData) {
  await runProductAction({ successMessage: FEEDBACK_MESSAGES.inventoryUpdated }, async () => {
    const draftInput = buildProductInventoryWorkflowFromFormData(formData);
    const { actorId, actorRole } = await currentActorContext();
    if (!actorId) throw new Error("Authentication required.");
    await saveProductInventory(draftInput, actorId, {
      actorRole,
      auditAction: "products.inventory_link"
    });
    await recordProductAuditTrail(
      {
        action: "products.inventory_link",
        entityTable: "mithron_products",
        entityId: draftInput.productSlug,
        snapshot: {
          product_slug: draftInput.productSlug,
          sku: draftInput.sku,
          variant_id: draftInput.variantId,
          warehouse_code: draftInput.warehouseCode,
          quantity: draftInput.quantity,
          available_quantity: draftInput.quantity
        },
        actorId,
        actorRole,
        changeSummary: draftInput.changeSummary,
        metadata: {
          product_slug: draftInput.productSlug,
          sku: draftInput.sku,
          variant_id: draftInput.variantId,
          warehouse_code: draftInput.warehouseCode
        }
      }
    );
    await revalidateCatalogSurfaces(draftInput.productSlug);
    revalidatePath("/admin/products");
    revalidatePath("/warehouse");
    revalidatePath("/warehouse/inventory");
    revalidatePath("/warehouse/movements");
  });
}
