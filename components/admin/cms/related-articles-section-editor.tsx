"use client";

import { useCallback, useState, useTransition, type FormEvent } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { saveHomepageV2SectionClientAction } from "@/app/admin/cms/actions";
import { CmsField, CmsTextAreaField } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import { emptyRelatedArticle, type CmsRelatedArticle } from "@/config/homepage-cms-v2";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

const RELATED_ARTICLE_SLOTS = 3;

function newArticleId() {
  return `related-article-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function padRelatedArticleSlots(items: CmsRelatedArticle[]): CmsRelatedArticle[] {
  const slots = items.slice(0, RELATED_ARTICLE_SLOTS).map((item, index) => ({
    ...item,
    id: item.id || `related-article-${index + 1}`
  }));
  while (slots.length < RELATED_ARTICLE_SLOTS) {
    slots.push({ ...emptyRelatedArticle(slots.length), id: newArticleId(), enabled: false });
  }
  return slots;
}

export function RelatedArticlesSectionEditor({
  enabled,
  items: initialItems,
  browseAllHref: initialBrowseAllHref = "",
  sectionTitle: initialSectionTitle = "",
  sectionLead: initialSectionLead = "",
  onDirty,
  onSaved,
  onSavingChange,
  onUploadingChange,
  uploadImage
}: {
  enabled: boolean;
  items: CmsRelatedArticle[];
  browseAllHref?: string;
  sectionTitle?: string;
  sectionLead?: string;
  onDirty: () => void;
  onSaved: () => void;
  onSavingChange?: (pending: boolean) => void;
  onUploadingChange?: (uploading: boolean) => void;
  uploadImage: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [items, setItems] = useState<CmsRelatedArticle[]>(() => padRelatedArticleSlots(initialItems));
  const [sectionEnabled, setSectionEnabled] = useState(enabled);
  const [, startTransition] = useTransition();

  const updateItem = useCallback(
    (index: number, patch: Partial<CmsRelatedArticle>) => {
      setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
      onDirty();
    },
    [onDirty]
  );

  const moveItem = (from: number, to: number) => {
    setItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    onDirty();
  };

  const clearSlot = (index: number) => {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...emptyRelatedArticle(index), id: newArticleId(), enabled: false } : item
      )
    );
    onDirty();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSavingChange?.(true);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await raceWithTimeout(
          saveHomepageV2SectionClientAction(formData),
          undefined,
          "Save related articles"
        );
        if (!result.ok) {
          notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
            source: "cms",
            id: "cms:related-articles:error"
          });
          return;
        }
        onSaved();
        notify.success(result.message || FEEDBACK_MESSAGES.changesSaved, {
          source: "cms",
          id: "cms:related-articles-save"
        });
      } finally {
        onSavingChange?.(false);
      }
    });
  };

  return (
    <form className="flex flex-col gap-6" onChange={onDirty} onSubmit={handleSubmit}>
      <input type="hidden" name="section_key" value="related-articles" />
      <input type="hidden" name="article_count" value={String(RELATED_ARTICLE_SLOTS)} />
      <input type="hidden" name="enabled" value={sectionEnabled ? "true" : "false"} />

      <label className="inline-flex items-center gap-2 text-sm text-[var(--platform-text-secondary)]">
        <input
          type="checkbox"
          checked={sectionEnabled}
          onChange={(event) => {
            setSectionEnabled(event.target.checked);
            onDirty();
          }}
        />
        Section enabled on homepage
      </label>

      <div className="grid gap-4 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 min-[1280px]:grid-cols-2">
        <CmsField label="Section title" name="section_title" defaultValue={initialSectionTitle} />
        <CmsField
          label="Browse all articles link"
          name="browse_all_href"
          defaultValue={initialBrowseAllHref || "/blog"}
        />
        <div className="min-[1280px]:col-span-2">
          <CmsTextAreaField label="Section lead / intro" name="section_lead" defaultValue={initialSectionLead} />
        </div>
      </div>

      <div className="grid gap-4">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
          Article cards ({RELATED_ARTICLE_SLOTS} slots)
        </h3>

        {items.map((item, index) => (
          <fieldset
            key={item.id}
            className="grid gap-4 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 text-[var(--platform-text-muted)]" aria-hidden="true" />
                <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--platform-text-secondary)]">
                  Slot {index + 1}
                </legend>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="platform-btn-ghost platform-btn-sm"
                  disabled={index === 0}
                  onClick={() => moveItem(index, index - 1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="platform-btn-ghost platform-btn-sm"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, index + 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="platform-btn-ghost platform-btn-sm text-[var(--platform-danger)]"
                  onClick={() => clearSlot(index)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <input type="hidden" name={`article_${index}_id`} value={item.id} />
            <input type="hidden" name={`article_${index}_enabled`} value={item.enabled ? "true" : "false"} />
            <label className="inline-flex items-center gap-2 text-xs text-[var(--platform-text-secondary)]">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) => updateItem(index, { enabled: event.target.checked })}
              />
              Enabled
            </label>

            <div className="grid gap-3 min-[1280px]:grid-cols-2">
              <CmsField
                label="Badge (optional, e.g. Press / Blog)"
                name={`article_${index}_eyebrow`}
                defaultValue={item.eyebrow}
                onChange={(event) => updateItem(index, { eyebrow: event.target.value })}
              />
              <CmsField
                label="CTA label"
                name={`article_${index}_cta_label`}
                defaultValue={item.ctaLabel || "Read Article"}
                onChange={(event) => updateItem(index, { ctaLabel: event.target.value })}
              />
            </div>
            <CmsField
              label="Title"
              name={`article_${index}_title`}
              defaultValue={item.title}
              onChange={(event) => updateItem(index, { title: event.target.value })}
            />
            <CmsField
              label="Redirect link"
              name={`article_${index}_href`}
              defaultValue={item.href}
              placeholder="https://… or /blog/…"
              onChange={(event) => updateItem(index, { href: event.target.value })}
            />
            <CmsTextAreaField
              label="Description"
              name={`article_${index}_content`}
              defaultValue={item.content}
              onChange={(event) => updateItem(index, { content: event.target.value })}
            />
            <CmsImageField
              label="Cover image"
              name={`article_${index}_image`}
              altName={`article_${index}_image_alt`}
              defaultValue={item.imageSrc}
              defaultAlt={item.imageAlt}
              spec={CMS_IMAGE_SPECS.relatedArticle}
              variant="compact"
              onUpload={uploadImage}
              onPreviewChange={(src) => updateItem(index, { imageSrc: src })}
              onUploadingChange={onUploadingChange}
            />
          </fieldset>
        ))}
      </div>
    </form>
  );
}
