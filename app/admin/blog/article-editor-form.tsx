"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import type { PressCoverageItem } from "@/services/press-coverage";
import { PressCoverImageField } from "@/app/admin/press/press-cover-image-field";
import {
  deleteArticleFormAction,
  publishArticleFormAction,
  publishExistingArticleFormAction,
  saveArticleDraftFormAction,
  unpublishArticleFormAction
} from "./actions";

const timedSaveArticleDraftFormAction = wrapServerAction(saveArticleDraftFormAction, { label: "Save article draft" });
const timedPublishArticleFormAction = wrapServerAction(publishArticleFormAction, { label: "Publish article" });
const timedUnpublishArticleFormAction = wrapServerAction(unpublishArticleFormAction, { label: "Unpublish article" });
const timedPublishExistingArticleFormAction = wrapServerAction(publishExistingArticleFormAction, { label: "Publish article" });
const timedDeleteArticleFormAction = wrapServerAction(deleteArticleFormAction, { label: "Delete article" });

const fieldClass =
  "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-surface-muted)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";

export function ArticleEditorForm({ item }: { item?: PressCoverageItem | null }) {
  const isEdit = Boolean(item?.id);

  return (
    <div className="grid gap-4" data-admin-article-editor>
      <form
        action={timedSaveArticleDraftFormAction}
        className="grid gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5"
      >
        {isEdit ? <input type="hidden" name="id" value={item!.id} /> : null}
        <input type="hidden" name="status" value={item?.status === "published" ? "published" : "draft"} />
        <input type="hidden" name="publisher" value={item?.publisher || "Mithron"} />
        <input type="hidden" name="sort_order" value={String(item?.sort_order ?? 100)} />

        <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
          Heading *
          <input name="title" required defaultValue={item?.title ?? ""} placeholder="Article heading" className={fieldClass} />
        </label>

        <PressCoverImageField defaultSrc={item?.cover_image.url ?? ""} defaultAlt={item?.cover_image.alt ?? ""} />

        <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
          Redirect link *
          <input
            name="external_url"
            type="url"
            required
            defaultValue={item?.external_url ?? ""}
            placeholder="https://… or /blog/…"
            className={fieldClass}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <OperationalSubmitButton className="platform-btn-secondary h-10 rounded-lg px-4 text-sm font-medium">
            Save draft
          </OperationalSubmitButton>
          <OperationalSubmitButton
            formAction={timedPublishArticleFormAction}
            className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium"
          >
            {isEdit && item?.status === "published" ? "Save & keep published" : "Publish"}
          </OperationalSubmitButton>
        </div>
      </form>

      {isEdit ? (
        <div className="flex flex-wrap gap-2">
          {item?.status === "published" ? (
            <form action={timedUnpublishArticleFormAction}>
              <input type="hidden" name="id" value={item!.id} />
              <OperationalSubmitButton className="platform-btn-secondary h-10 rounded-lg px-4 text-sm font-medium">
                Unpublish
              </OperationalSubmitButton>
            </form>
          ) : (
            <form action={timedPublishExistingArticleFormAction}>
              <input type="hidden" name="id" value={item!.id} />
              <OperationalSubmitButton className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
                Publish
              </OperationalSubmitButton>
            </form>
          )}
          <form action={timedDeleteArticleFormAction}>
            <input type="hidden" name="id" value={item!.id} />
            <OperationalSubmitButton className="h-10 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700">
              Delete
            </OperationalSubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
