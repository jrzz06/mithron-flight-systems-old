"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { probeExternalUrl } from "@/lib/press/validate-external-url";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { requireAdminPermission } from "@/services/auth";
import {
  createPressCoverage,
  deletePressCoverage,
  publishPressCoverage,
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

function revalidateArticleSurfaces() {
  revalidateTag("press", "max");
  revalidateTag("blog", "max");
  revalidatePath("/");
  revalidatePath("/admin/blog");
  revalidatePath("/admin/press");
  revalidatePath("/blog");
}

async function resolveRedirectLink(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Redirect link is required.");
  // Allow internal paths for layman CMS (e.g. /blog/my-post).
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (value.length > 500) throw new Error("Redirect link is too long.");
    return value;
  }
  return probeExternalUrl(value);
}

async function parseArticleForm(formData: FormData, forceStatus?: PressPublishStatus) {
  const title = readString(formData, "title");
  const publisher = readString(formData, "publisher") || "Mithron";
  const externalUrl = await resolveRedirectLink(readString(formData, "external_url"));
  const coverUrl = readString(formData, "cover_image_src");
  const coverAlt = readString(formData, "cover_image_alt");
  const sortRaw = Number(readString(formData, "sort_order"));
  const statusRaw = forceStatus ?? (readString(formData, "status") as PressPublishStatus) ?? "draft";
  const status: PressPublishStatus =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";

  if (!title) throw new Error("Heading is required.");

  return {
    publisher,
    title,
    description: "",
    externalUrl,
    coverImage: {
      url: coverUrl,
      alt: coverAlt || title
    },
    sortOrder: Number.isFinite(sortRaw) ? Math.trunc(sortRaw) : 100,
    isFeatured: true,
    status
  };
}

export async function saveArticleDraftFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");

  try {
    const input = await parseArticleForm(formData, "draft");
    if (id) {
      await updatePressCoverage(id, input, context.userId);
    } else {
      await createPressCoverage(input, context.userId);
    }
    revalidateArticleSurfaces();
    redirect(feedbackUrl("success", id ? "Article saved." : "Article created."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), id ? { edit: id } : { new: "1" }));
  }
}

export async function publishArticleFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");

  try {
    const input = await parseArticleForm(formData, "published");
    if (id) {
      await updatePressCoverage(id, input, context.userId);
      await publishPressCoverage(id, context.userId);
    } else {
      const created = await createPressCoverage({ ...input, status: "published" }, context.userId);
      await publishPressCoverage(created.id, context.userId);
    }
    revalidateArticleSurfaces();
    redirect(feedbackUrl("success", "Article published."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), id ? { edit: id } : { new: "1" }));
  }
}

export async function publishExistingArticleFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Article not found."));

  try {
    await publishPressCoverage(id, context.userId);
    revalidateArticleSurfaces();
    redirect(feedbackUrl("success", "Article published."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { edit: id }));
  }
}

export async function unpublishArticleFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Article not found."));

  try {
    await unpublishPressCoverage(id, context.userId);
    revalidateArticleSurfaces();
    redirect(feedbackUrl("success", "Article unpublished."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { edit: id }));
  }
}

export async function deleteArticleFormAction(formData: FormData) {
  const context = await requireAdminPermission("cms.write");
  const id = readString(formData, "id");
  if (!id) redirect(feedbackUrl("error", "Article not found."));

  try {
    await deletePressCoverage(id, context.userId);
    revalidateArticleSurfaces();
    redirect(feedbackUrl("success", "Article deleted."));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error)));
  }
}
