"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateControlPlaneRealtime } from "@/lib/control-plane/revalidate-realtime";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { requireAdminPermission } from "@/services/auth";
import {
  deleteCustomerReviewAdmin,
  bulkModerateCustomerReviews,
  moderateCustomerReview
} from "@/services/customer-product-reviews";

function feedbackUrl(status: "success" | "error", message: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    review_status: status,
    review_message: message,
    ...extra
  });
  return `/admin/reviews?${params.toString()}`;
}

async function revalidateReviewSurfaces(productSlug?: string) {
  revalidateTag("reviews:home", "max");
  revalidateTag("admin-reviews", "max");
  revalidateTag("control-plane-reviews", "max");
  if (productSlug) {
    revalidateTag(`reviews:${productSlug}`, "max");
    revalidatePath(`/product/${productSlug}`);
  }
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  await revalidateControlPlaneRealtime("customer_order_reviews");
}

export async function publishCustomerReviewFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  if (!id) redirect(feedbackUrl("error", "Review id is required."));

  try {
    await moderateCustomerReview({ id, status: "published" }, actor.userId);
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", "Review published."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Publish failed."));
  }
}

export async function rejectCustomerReviewFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  if (!id) redirect(feedbackUrl("error", "Review id is required."));

  try {
    await moderateCustomerReview({ id, status: "rejected" }, actor.userId);
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", "Review rejected."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Reject failed."));
  }
}

export async function updateCustomerReviewAdminFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  if (!id || !body || !customerName || !productSlug) {
    redirect(feedbackUrl("error", "Name, product, and description are required."));
  }

  try {
    await moderateCustomerReview(
      {
        id,
        body,
        customerName,
        productSlug,
        status: "published",
        isVisible: true
      },
      actor.userId
    );
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", "Review updated."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Update failed."));
  }
}

export async function createCustomerReviewAdminFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  if (!body || !customerName || !productSlug) {
    redirect(feedbackUrl("error", "Name, product, and description are required.", { new: "1" }));
  }

  try {
    const { createCustomerReviewAdmin } = await import("@/services/customer-product-reviews");
    await createCustomerReviewAdmin(
      {
        customerName,
        productSlug,
        body,
        status: "published",
        rating: 5
      },
      actor.userId
    );
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", "Review created."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", error instanceof Error ? error.message : "Create failed.", { new: "1" })
    );
  }
}

export async function toggleCustomerReviewVisibilityFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  const isVisible = String(formData.get("is_visible") ?? "") === "true";
  if (!id) redirect(feedbackUrl("error", "Review id is required."));

  try {
    await moderateCustomerReview({ id, isVisible }, actor.userId);
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", isVisible ? "Review shown on storefront." : "Review hidden from storefront."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Visibility update failed."));
  }
}

export async function toggleCustomerReviewPinnedFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  const pinned = String(formData.get("pinned") ?? "") === "true";
  if (!id) redirect(feedbackUrl("error", "Review id is required."));

  try {
    await moderateCustomerReview({ id, pinned, status: pinned ? "published" : undefined }, actor.userId);
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", pinned ? "Review pinned." : "Review unpinned."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Pin update failed."));
  }
}

export async function bulkCustomerReviewsFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const action = String(formData.get("bulk_action") ?? "").trim();
  const ids = formData
    .getAll("review_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!ids.length) redirect(feedbackUrl("error", "Select at least one review."));

  try {
    if (action === "hide" || action === "show" || action === "pin" || action === "unpin" || action === "delete") {
      await bulkModerateCustomerReviews({ ids, action }, actor.userId);
    } else {
      throw new Error("Unknown bulk action.");
    }
    await revalidateReviewSurfaces();
    redirect(feedbackUrl("success", `Bulk ${action || "update"} completed for ${ids.length} review(s).`));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Bulk action failed."));
  }
}

export async function deleteCustomerReviewAdminFormAction(formData: FormData) {
  const actor = await requireAdminPermission("enquiries.write");
  const id = String(formData.get("id") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  if (!id) redirect(feedbackUrl("error", "Review id is required."));

  try {
    await deleteCustomerReviewAdmin(id, actor.userId);
    await revalidateReviewSurfaces(productSlug);
    redirect(feedbackUrl("success", "Review deleted."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", error instanceof Error ? error.message : "Delete failed."));
  }
}
