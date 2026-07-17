"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import type { PressCoverageItem } from "@/services/press-coverage";
import { PressCoverImageField } from "./press-cover-image-field";
import {
  archivePressFormAction,
  deletePressFormAction,
  publishExistingPressFormAction,
  publishPressFormAction,
  savePressDraftFormAction,
  unpublishPressFormAction
} from "./actions";

const timedSavePressDraftFormAction = wrapServerAction(savePressDraftFormAction, { label: "Save press draft" });
const timedPublishPressFormAction = wrapServerAction(publishPressFormAction, { label: "Publish press" });
const timedUnpublishPressFormAction = wrapServerAction(unpublishPressFormAction, { label: "Unpublish press" });
const timedPublishExistingPressFormAction = wrapServerAction(publishExistingPressFormAction, { label: "Publish press" });
const timedArchivePressFormAction = wrapServerAction(archivePressFormAction, { label: "Archive press" });
const timedDeletePressFormAction = wrapServerAction(deletePressFormAction, { label: "Delete press" });

const fieldClass =
  "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-surface-muted)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";

export function PressCoverageEditorForm({ item }: { item?: PressCoverageItem | null }) {
  const isEdit = Boolean(item?.id);

  return (
    <div className="grid gap-4" data-admin-press-editor>
      <form
        action={timedSavePressDraftFormAction}
        className="grid gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5"
      >
        {isEdit ? <input type="hidden" name="id" value={item!.id} /> : null}
        <input type="hidden" name="status" value={item?.status === "published" ? "published" : "draft"} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
            Publisher *
            <input name="publisher" required defaultValue={item?.publisher ?? ""} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
            Display order
            <input
              name="sort_order"
              type="number"
              defaultValue={item?.sort_order ?? 100}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
          Article title *
          <input name="title" required defaultValue={item?.title ?? ""} className={fieldClass} />
        </label>

        <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={600}
            defaultValue={item?.description ?? ""}
            className="w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--platform-text-muted)]">
          External article URL *
          <input
            name="external_url"
            type="url"
            required
            defaultValue={item?.external_url ?? ""}
            placeholder="https://"
            className={fieldClass}
          />
        </label>

        <PressCoverImageField
          defaultSrc={item?.cover_image.url ?? ""}
          defaultAlt={item?.cover_image.alt ?? ""}
        />

        <label className="inline-flex items-center gap-2 text-sm text-[var(--platform-text-secondary)]">
          <input
            type="checkbox"
            name="is_featured"
            defaultChecked={item?.is_featured ?? false}
            className="size-4 rounded border-[var(--platform-border)]"
          />
          Featured in press showcase
        </label>

        <div className="flex flex-wrap gap-2">
          <OperationalSubmitButton className="platform-btn-secondary h-10 rounded-lg px-4 text-sm font-medium">
            Save draft
          </OperationalSubmitButton>
          <OperationalSubmitButton formAction={timedPublishPressFormAction} className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
            {isEdit && item?.status === "published" ? "Save & keep published" : "Publish"}
          </OperationalSubmitButton>
        </div>
      </form>

      {isEdit ? (
        <div className="flex flex-wrap gap-2">
          {item?.status === "published" ? (
            <form action={timedUnpublishPressFormAction}>
              <input type="hidden" name="id" value={item!.id} />
              <OperationalSubmitButton className="platform-btn-secondary h-10 rounded-lg px-4 text-sm font-medium">
                Unpublish
              </OperationalSubmitButton>
            </form>
          ) : (
            <form action={timedPublishExistingPressFormAction}>
              <input type="hidden" name="id" value={item!.id} />
              <OperationalSubmitButton className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
                Publish
              </OperationalSubmitButton>
            </form>
          )}
          <form action={timedArchivePressFormAction}>
            <input type="hidden" name="id" value={item!.id} />
            <OperationalSubmitButton className="platform-btn-secondary h-10 rounded-lg px-4 text-sm font-medium">
              Archive
            </OperationalSubmitButton>
          </form>
          <form action={timedDeletePressFormAction}>
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
