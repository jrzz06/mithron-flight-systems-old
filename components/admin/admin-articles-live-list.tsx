"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import { wrapServerAction } from "@/hooks/use-async-action";
import type { PressCoverageItem, PressPublishStatus } from "@/lib/press/press-coverage-shared";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";
import {
  deleteArticleFormAction,
  publishExistingArticleFormAction,
  unpublishArticleFormAction
} from "@/app/admin/blog/actions";

const timedUnpublishArticle = wrapServerAction(unpublishArticleFormAction, { label: "Unpublish article" });
const timedPublishArticle = wrapServerAction(publishExistingArticleFormAction, { label: "Publish article" });
const timedDeleteArticle = wrapServerAction(deleteArticleFormAction, { label: "Delete article" });

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseCoverImage(value: unknown): PressCoverageItem["cover_image"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { url: "", alt: "" };
  }
  const row = value as Record<string, unknown>;
  return {
    url: text(row.url),
    alt: text(row.alt) || undefined,
    mediaAssetId: row.mediaAssetId != null ? text(row.mediaAssetId) : row.media_asset_id != null ? text(row.media_asset_id) : null
  };
}

function mapPressCoverageRow(row: AdminEntityRow): PressCoverageItem {
  const statusRaw = text(row.status, "draft");
  const status: PressPublishStatus =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";

  return {
    id: text(row.id),
    publisher: text(row.publisher),
    title: text(row.title),
    description: text(row.description),
    cover_image: parseCoverImage(row.cover_image),
    external_url: text(row.external_url),
    sort_order: Number(row.sort_order) || 100,
    is_featured: row.is_featured === true,
    status,
    is_visible: row.is_visible !== false,
    published_at: row.published_at ? text(row.published_at) : null,
    archived_at: row.archived_at ? text(row.archived_at) : null,
    created_at: row.created_at ? text(row.created_at) : undefined,
    updated_at: row.updated_at ? text(row.updated_at) : undefined
  };
}

function ArticleRow({ item }: { item: PressCoverageItem }) {
  return (
    <tr className="border-t border-[var(--platform-border)]">
      <td className="px-3 py-3">
        <Link href={`/admin/blog?edit=${item.id}`} className="font-medium text-[var(--platform-text-primary)] hover:underline">
          {item.title}
        </Link>
      </td>
      <td className="px-3 py-3">
        <a
          href={item.external_url}
          target={item.external_url.startsWith("http") ? "_blank" : undefined}
          rel={item.external_url.startsWith("http") ? "noopener noreferrer" : undefined}
          className="truncate text-xs text-[var(--platform-text-muted)] hover:underline"
        >
          {item.external_url}
        </a>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/blog?edit=${item.id}`} className="text-xs font-medium text-[var(--platform-accent)]">
            Edit
          </Link>
          {item.status === "published" ? (
            <form action={timedUnpublishArticle}>
              <input type="hidden" name="id" value={item.id} />
              <OperationalSubmitButton pendingLabel="…" className="text-xs font-medium text-[var(--platform-text-muted)]">
                Unpublish
              </OperationalSubmitButton>
            </form>
          ) : item.status !== "archived" ? (
            <form action={timedPublishArticle}>
              <input type="hidden" name="id" value={item.id} />
              <OperationalSubmitButton pendingLabel="…" className="text-xs font-medium text-[var(--platform-accent)]">
                Publish
              </OperationalSubmitButton>
            </form>
          ) : null}
          <form action={timedDeleteArticle}>
            <input type="hidden" name="id" value={item.id} />
            <OperationalSubmitButton pendingLabel="…" className="text-xs font-medium text-rose-400">
              Delete
            </OperationalSubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

type AdminArticlesLiveListProps = {
  articles: PressCoverageItem[];
  loadError?: string | null;
};

export function AdminArticlesLiveList({ articles, loadError }: AdminArticlesLiveListProps) {
  const liveRows = useAdminLiveCollectionRows(
    "articles",
    "press_coverage",
    articles as unknown as AdminEntityRow[],
    ["id"]
  );
  const liveArticles = liveRows.map(mapPressCoverageRow);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-[var(--platform-border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--platform-surface-muted)] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Heading</th>
            <th className="px-3 py-2 font-medium">Link</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {liveArticles.length ? (
            liveArticles.map((item) => <ArticleRow key={item.id} item={item} />)
          ) : (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-[var(--platform-text-muted)]">
                {loadError
                  ? "Articles could not be loaded."
                  : "No articles yet. Add a heading, image, and redirect link to get started."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
