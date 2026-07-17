"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { readEditorDocumentFields } from "@/lib/editor/read-form-content";
import { prepareEditorHtmlForSave } from "@/lib/editor/prepare-html";
import { maybeNormalizeProductDescription } from "@/lib/product-description-normalize";
import { readExpectedUpdatedAt } from "@/lib/admin/conflict-handling";
import { parseSupplierProductForm } from "@/lib/supplier/product-form";
import { logSupplierProductFormDebug } from "@/lib/supplier/product-form-debug";
import type { SupplierProductFormState } from "@/components/supplier/supplier-new-product-form";
import { createNotificationRecord, fetchAdminRecordsByColumn } from "@/services/admin-actions";
import { linkUploadedImagesToProduct } from "@/lib/product-gallery";
import { resolveSupplierProductImageFields, readProductImageSrc } from "@/lib/supplier/product-image";
import { requirePermission } from "@/services/auth";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import {
  createSupplierProductDraft,
  deleteSupplierOwnedProduct,
  listAdminUserIds,
  submitSupplierProductForReview,
  supplierProductMutationOptions,
  updateSupplierOwnedProduct
} from "@/services/supplier-actions";

async function revalidateSupplierProductSurfaces() {
  revalidatePath("/supplier/products");
  revalidatePath("/admin/suppliers/products");
  await revalidateAfterMutation("mithron_products", "notifications");
}
function actionMessage(error: unknown) {
  if (isNextRedirect(error)) throw error;
  const message = error instanceof Error ? error.message : "Could not save product draft.";
  return message.slice(0, 240);
}

function supplierProductRedirect(path: string, status: "success" | "error", message: string): never {
  redirect(`${path}?product_status=${status}&product_message=${encodeURIComponent(message.slice(0, 240))}`);
}

async function readSupplierProductDescriptionFields(formData: FormData) {
  const editor = readEditorDocumentFields(formData, "description_json", "description");
  if (!editor) return {};
  // Keep the supplier's own wording exactly as written: sanitize/clean the
  // editor markup only, never run it through the deterministic
  // spec-boundary/bold-label rewriter. That rewriter exists for messy
  // Wix-imported text, not for content a person just typed. The RichTextEditor's
  // own "Improve with AI" action (app/api/editor/ai) remains available for
  // suppliers who explicitly want an AI-polished rewrite.
  // Preserve text/background color marks from the editor on save.
  return {
    description: prepareEditorHtmlForSave(editor.html) || maybeNormalizeProductDescription(editor.html) || null,
    description_json: editor.json
  };
}

async function notifyAdminsOfSubmission(productName: string, slug: string, actorId: string) {
  const adminIds = await listAdminUserIds();
  await Promise.all(
    adminIds.map((adminId) =>
      createNotificationRecord(
        {
          recipient_id: adminId,
          channel: "admin",
          title: "Product submitted for review",
          body: `Supplier submitted "${productName}" (${slug}) for approval.`,
          status: "unread",
          entity_table: "mithron_products",
          entity_id: slug
        },
        actorId
      ).catch((notificationError) => {
        console.warn("[mithron-supplier] Failed to notify admin of product submission.", notificationError);
        return undefined;
      })
    )
  );
}

async function saveSupplierProductDraft(formData: FormData) {
  const rawEntries = Object.fromEntries(formData.entries());
  logSupplierProductFormDebug("raw FormData", rawEntries);

  const context = await requirePermission("products.submit");
  if (!context.userId) throw new Error("Authentication required.");

  logSupplierProductFormDebug("auth context", {
    userId: context.userId,
    role: context.role
  });

  let parsed;
  try {
    parsed = parseSupplierProductForm(formData);
  } catch (validationError) {
    logSupplierProductFormDebug("validation error", {
      message: actionMessage(validationError),
      rawPrice: String(formData.get("price") ?? "")
    });
    throw validationError;
  }

  const { name, category, price, slug } = parsed;
  const submitForApproval = String(formData.get("submit_for_approval") ?? "0") === "1";

  logSupplierProductFormDebug("parsed values", {
    name,
    category,
    price,
    slug,
    submitForApproval,
    rawPrice: String(formData.get("price") ?? "")
  });

  const insertPayload = {
    slug,
    name,
    tagline: name,
    category,
    price,
    product_url: `/product/${slug}`,
    gallery: [],
    variants: [],
    bundles: [],
    story: [],
    specs: {},
    anchors: [],
    interests: [],
    ...await readSupplierProductDescriptionFields(formData)
  };

  const { image, hero, gallery, uploadedImages } = await resolveSupplierProductImageFields(formData, {
    slug,
    name,
    actorId: context.userId,
    requireImage: true
  });

  logSupplierProductFormDebug("insert payload", {
    supplierId: context.userId,
    insertPayload: { ...insertPayload, image, hero, gallery }
  });

  await createSupplierProductDraft(
    context.userId,
    {
      ...insertPayload,
      image,
      hero,
      gallery
    },
    context.userId
  );

  let imageLinkWarning = "";
  if (uploadedImages.length) {
    // The draft row above is already committed - a media-link failure here
    // must not be swallowed silently (the primary image would then miss
    // responsive delivery with no signal to the supplier), so it gets
    // appended to the redirect message below instead.
    try {
      await linkUploadedImagesToProduct(slug, uploadedImages, {
        name,
        source: "supplier-product-create",
        actorId: context.userId,
        mutationOptions: supplierProductMutationOptions
      });
    } catch (error) {
      if (isNextRedirect(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[supplier-products] failed to link uploaded images for ${slug}: ${message}`);
      imageLinkWarning = ` Uploaded images could not be linked (${message}) - reopen the product and re-save the images.`;
    }
  }

  logSupplierProductFormDebug("insert success", { slug, workflow_status: "draft", image_link_failed: Boolean(imageLinkWarning) });

  await revalidateSupplierProductSurfaces();

  if (submitForApproval) {
    try {
      await submitSupplierProductForReview(context.userId, slug, context.userId);
      await notifyAdminsOfSubmission(name, slug, context.userId);
      await revalidateSupplierProductSurfaces();
      logSupplierProductFormDebug("redirect", {
        target: "/supplier/products",
        status: "success",
        message: `"${name}" saved and sent for review.`
      });
      supplierProductRedirect(
        "/supplier/products",
        "success",
        `${FEEDBACK_MESSAGES.productCreated}${imageLinkWarning}`
      );
    } catch (submitError) {
      if (isNextRedirect(submitError)) throw submitError;
      logSupplierProductFormDebug("submit-after-create error", { message: actionMessage(submitError), slug });
      supplierProductRedirect(
        `/supplier/products/${slug}/edit`,
        "error",
        `"${name}" saved as draft but could not be sent for review. Open My products and click Send for review. ${actionMessage(submitError)}`
      );
    }
  }

  logSupplierProductFormDebug("redirect", {
    target: `/supplier/products/${slug}/edit`,
    status: "success",
    message: `"${name}" saved as draft. Send for review when ready.`
  });

  supplierProductRedirect(
    `/supplier/products/${slug}/edit`,
    "success",
    `${FEEDBACK_MESSAGES.productCreated}${imageLinkWarning}`
  );
}

export async function createSupplierProductFormStateAction(
  _prev: SupplierProductFormState,
  formData: FormData
): Promise<SupplierProductFormState> {
  try {
    await saveSupplierProductDraft(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = actionMessage(error);
    logSupplierProductFormDebug("action error", { message });
    return {
      status: "error",
      message,
      debug: process.env.SUPPLIER_PRODUCT_FORM_DEBUG === "1"
        ? [{ label: "Server action error", value: message }]
        : undefined
    };
  }

  return { status: "idle", message: "" };
}

export async function updateSupplierProductFormStateAction(
  _prev: SupplierProductFormState,
  formData: FormData
): Promise<SupplierProductFormState> {
  try {
    const context = await requirePermission("products.submit");
    if (!context.userId) throw new Error("Authentication required.");
    const slug = String(formData.get("slug") ?? "").trim();
    if (!slug) throw new Error("Product slug is required.");

    const { name, category, price } = parseSupplierProductForm(formData);
    const existingRows = await fetchAdminRecordsByColumn("mithron_products", "slug", slug);
    const existingImageSrc = readProductImageSrc(existingRows[0]?.image) || readProductImageSrc(existingRows[0]?.hero);

    const existingRow = existingRows[0];
    const { image, hero, gallery, uploadedImages } = await resolveSupplierProductImageFields(formData, {
      slug,
      name,
      actorId: context.userId,
      existingImageSrc,
      existingProductRow: existingRow,
      requireImage: false
    });

    await updateSupplierOwnedProduct(
      context.userId,
      slug,
      {
        name,
        category,
        price,
        image,
        hero,
        gallery,
        ...await readSupplierProductDescriptionFields(formData),
        updated_at: new Date().toISOString()
      },
      context.userId,
      process.env,
      { expectedUpdatedAt: readExpectedUpdatedAt(formData, String(existingRows[0]?.updated_at ?? "")) }
    );

    let imageLinkWarning = "";
    if (uploadedImages.length) {
      // The update above is already committed - report a media-link failure
      // as a warning appended to the success message instead of throwing
      // (which would misreport the completed save as failed) or dropping it
      // silently (which would leave images without responsive delivery).
      try {
        await linkUploadedImagesToProduct(slug, uploadedImages, {
          name,
          source: "supplier-product-update",
          actorId: context.userId,
          mutationOptions: supplierProductMutationOptions
        });
      } catch (linkError) {
        if (isNextRedirect(linkError)) throw linkError;
        const message = linkError instanceof Error ? linkError.message : String(linkError);
        console.warn(`[supplier-products] failed to link uploaded images for ${slug}: ${message}`);
        imageLinkWarning = ` Uploaded images could not be linked (${message}) - reopen the product and re-save the images.`;
      }
    }
    revalidatePath(`/supplier/products/${slug}/edit`);
    await revalidateSupplierProductSurfaces();
    return { status: "success", message: `Product changes saved.${imageLinkWarning}` };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return { status: "error", message: actionMessage(error) };
  }
}

export async function submitSupplierProductFormAction(formData: FormData) {
  try {
    const context = await requirePermission("products.submit");
    if (!context.userId) throw new Error("Authentication required.");
    const slug = String(formData.get("slug") ?? "").trim();
    if (!slug) throw new Error("Product slug is required.");

    const rows = await fetchAdminRecordsByColumn("mithron_products", "slug", slug);
    const productName = String(rows[0]?.name ?? slug);

    await submitSupplierProductForReview(context.userId, slug, context.userId);
    await notifyAdminsOfSubmission(productName, slug, context.userId);

    await revalidateSupplierProductSurfaces();
    supplierProductRedirect("/supplier/products", "success", FEEDBACK_MESSAGES.productUpdated);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    supplierProductRedirect("/supplier/products", "error", actionMessage(error));
  }
}

export async function deleteSupplierProductFormAction(formData: FormData) {
  try {
    const context = await requirePermission("products.submit");
    if (!context.userId) throw new Error("Authentication required.");
    const slug = String(formData.get("slug") ?? "").trim();
    if (!slug) throw new Error("Product slug is required.");

    const productName = await deleteSupplierOwnedProduct(context.userId, slug, context.userId);

    await revalidateSupplierProductSurfaces();
    supplierProductRedirect("/supplier/products", "success", `"${productName}" draft deleted.`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    supplierProductRedirect("/supplier/products", "error", actionMessage(error));
  }
}
