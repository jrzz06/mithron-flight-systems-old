"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { probeExternalUrl } from "@/lib/press/validate-external-url";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { requireAdminPermission } from "@/services/auth";
import {
  archivePressCoverage,
  createPressCoverage,
  deletePressCoverage,
  publishPressCoverage,
  reorderPressCoverage,
  unpublishPressCoverage,
  updatePressCoverage,
  type PressPublishStatus
} from "@/services/press-coverage";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function feedbackUrl(status: "success" | "error", message: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    article_status: status,
    article_message: message,
    ...extra
  });
  return `/admin/blog?${params.toString()}`;
}

function actionError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function revalidatePressSurfaces() {
  revalidateTag("press", "max");
  revalidatePath("/");
  revalidatePath("/admin/blog");
  revalidatePath("/admin/press");
}

async function parseFormToPressInput(formData: FormData, forceStatus?: PressPublishStatus) {
  const publisher = readString(formData, "publisher");
  const title = readString(formData, "title");
  const description = readString(formData, "description");
  const externalUrl = await probeExternalUrl(readString(formData, "external_url"));
  const coverUrl = readString(formData, "cover_image_src");
  const coverAlt = readString(formData, "cover_image_alt");
  const sortRaw = Number(readString(formData, "sort_order"));
  const isFeatured = formData.get("is_featured") === "on" || formData.get("is_featured") === "true";
  const statusRaw = forceStatus ?? (readString(formData, "status") as PressPublishStatus) ?? "draft";
  const status: PressPublishStatus =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";

  if (!publisher) throw new Error("Publisher is required.");
  if (!title) throw new Error("Article title is required.");

  return {
    publisher,
    title,
    description,
    externalUrl,
    coverImage: {
      url: coverUrl,
      alt: coverAlt || title
    },
    sortOrder: Number.isFinite(sortRaw) ? Math.trunc(sortRaw) : 100,
    isFeatured,
    status
  };
}

export async function savePressDraftFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");

  try {
    const input = await parseFormToPressInput(formData, "draft");
    if (id) {
      await updatePressCoverage(id, input, context.userId);
    } else {
      await createPressCoverage(input, context.userId);
    }
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", id ? "Press item saved." : "Press item created."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), id ? { edit: id } : { new: "1" }));
  }
}

export async function publishPressFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");

  try {
    const input = await parseFormToPressInput(formData, "published");
    if (id) {
      await updatePressCoverage(id, input, context.userId);
      await publishPressCoverage(id, context.userId);
    } else {
      const created = await createPressCoverage({ ...input, status: "published" }, context.userId);
      await publishPressCoverage(created.id, context.userId);
    }
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Press item published."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), id ? { edit: id } : { new: "1" }));
  }
}

export async function publishExistingPressFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Press item not found."));

  try {
    await publishPressCoverage(id, context.userId);
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Press item published."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { edit: id }));
  }
}

export async function unpublishPressFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Press item not found."));

  try {
    await unpublishPressCoverage(id, context.userId);
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Press item unpublished."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { edit: id }));
  }
}

export async function archivePressFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Press item not found."));

  try {
    await archivePressCoverage(id, context.userId);
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Press item archived."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { edit: id }));
  }
}

export async function deletePressFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Press item not found."));

  try {
    await deletePressCoverage(id, context.userId);
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Press item deleted."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error)));
  }
}

export async function reorderPressCoverageFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const orderedIds = formData
    .getAll("ordered_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  try {
    await reorderPressCoverage(orderedIds, context.userId);
    revalidatePressSurfaces();
    redirect(feedbackUrl("success", "Display order updated."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error)));
  }
}
