"use client";

import { useCallback, useMemo, useState, useTransition, type FormEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  saveHomepageTestimonialsHeaderClientAction,
  saveHomepageV2SectionClientAction
} from "@/app/admin/cms/actions";
import { CmsField, CmsSelectField, CmsTextAreaField } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { ShelfProductReplaceEditor } from "@/components/admin/cms/shelf-product-replace-editor";
import type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import {
  emptyTestimonialCard,
  type CmsTestimonialCard,
  type HomepageCmsV2Content
} from "@/config/homepage-cms-v2";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

function newCardId() {
  return `testimonial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function TestimonialsSectionEditor({
  header,
  reviews,
  cards: initialCards,
  browseCatalog = [],
  products,
  onDirty,
  onSaved,
  onSavingChange,
  onUploadingChange,
  uploadImage
}: {
  header: HomepageCmsContent["testimonials"];
  reviews: HomepageCmsV2Content["reviews"];
  cards: CmsTestimonialCard[];
  browseCatalog?: ShelfSlotProductItem[];
  products: Array<{ slug: string; name: string; image?: { src?: string } }>;
  onDirty: () => void;
  onSaved: () => void;
  onSavingChange?: (pending: boolean) => void;
  onUploadingChange?: (uploading: boolean) => void;
  uploadImage: (file: File) => Promise<{ src: string; alt?: string } | null>;
}) {
  const [cards, setCards] = useState<CmsTestimonialCard[]>(() =>
    initialCards.length
      ? [...initialCards].sort((a, b) => a.sortOrder - b.sortOrder)
      : []
  );
  const [, startTransition] = useTransition();
  const maxCards = Math.max(1, Math.min(12, Number(reviews.maxCount) || 6));
  const atCardLimit = cards.length >= maxCards;

  const productBySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const updateCard = useCallback(
    (index: number, patch: Partial<CmsTestimonialCard>) => {
      setCards((current) => current.map((card, i) => (i === index ? { ...card, ...patch } : card)));
      onDirty();
    },
    [onDirty]
  );

  const moveCard = (from: number, to: number) => {
    setCards((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((card, index) => ({ ...card, sortOrder: index }));
    });
    onDirty();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSavingChange?.(true);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const headerResult = await raceWithTimeout(
          saveHomepageTestimonialsHeaderClientAction(formData),
          undefined,
          "Save testimonials header"
        );
        if (!headerResult.ok) {
          notify.error(headerResult.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
            source: "cms",
            id: "cms:testimonials-header:error"
          });
          return;
        }
        const cardsResult = await raceWithTimeout(
          saveHomepageV2SectionClientAction(formData),
          undefined,
          "Save testimonial cards"
        );
        if (!cardsResult.ok) {
          notify.error(cardsResult.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
            source: "cms",
            id: "cms:testimonials-cards:error"
          });
          return;
        }
        onSaved();
        notify.success(cardsResult.message || FEEDBACK_MESSAGES.changesSaved, {
          source: "cms",
          id: "cms:testimonials-save"
        });
      } finally {
        onSavingChange?.(false);
      }
    });
  };

  return (
    <form className="flex flex-col gap-6" onChange={onDirty} onSubmit={handleSubmit}>
      <input type="hidden" name="section_key" value="testimonials" />
      <input type="hidden" name="card_count" value={String(cards.length)} />

      <div className="grid gap-4 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 min-[1280px]:grid-cols-2">
        <CmsField label="Heading" name="title" defaultValue={header.title} />
        <CmsField label="Accent phrase" name="title_accent" defaultValue={header.titleAccent} />
        <CmsField label="Eyebrow" name="eyebrow" defaultValue={header.eyebrow} />
        <CmsField label="Browse link label" name="link_label" defaultValue={header.linkLabel} />
        <CmsField label="Browse link" name="link_href" defaultValue={header.linkHref} />
        <CmsTextAreaField label="Lead" name="lead" defaultValue={header.lead} />
        <CmsField label="Max cards shown" name="max_count" defaultValue={String(reviews.maxCount)} type="number" />
        <CmsSelectField
          label="Sort order"
          name="sort_order"
          defaultValue={reviews.sortOrder}
          options={[
            { value: "manual", label: "Manual (card order)" },
            { value: "newest", label: "Newest first" },
            { value: "rating", label: "Highest rating" }
          ]}
        />
        <input type="hidden" name="enabled" value={reviews.enabled ? "true" : "false"} />
      </div>

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Testimonial cards</h3>
          <button
            type="button"
            className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5"
            disabled={atCardLimit}
            title={atCardLimit ? `Maximum ${maxCards} cards` : undefined}
            onClick={() => {
              setCards((current) => {
                if (current.length >= maxCards) return current;
                return [
                  ...current,
                  { ...emptyTestimonialCard(current.length), id: newCardId(), sortOrder: current.length }
                ];
              });
              onDirty();
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add card{atCardLimit ? ` (${maxCards} max)` : ""}
          </button>
        </div>

        {!cards.length ? (
          <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-4 py-6 text-sm text-[var(--platform-text-muted)]">
            No testimonial cards yet. Add a card to show reviews on the homepage.
          </p>
        ) : null}

        {cards.map((card, index) => {
          const product = card.productSlug ? productBySlug.get(card.productSlug) : undefined;
          return (
            <fieldset
              key={card.id}
              className="grid gap-4 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 text-[var(--platform-text-muted)]" aria-hidden="true" />
                  <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--platform-text-secondary)]">
                    Card {index + 1}
                  </legend>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="platform-btn-ghost platform-btn-sm"
                    disabled={index === 0}
                    onClick={() => moveCard(index, index - 1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="platform-btn-ghost platform-btn-sm"
                    disabled={index === cards.length - 1}
                    onClick={() => moveCard(index, index + 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="platform-btn-ghost platform-btn-sm text-[var(--platform-danger)]"
                    onClick={() => {
                      setCards((current) =>
                        current.filter((_, i) => i !== index).map((row, i) => ({ ...row, sortOrder: i }))
                      );
                      onDirty();
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>

              <input type="hidden" name={`card_${index}_id`} value={card.id} />
              <input type="hidden" name={`card_${index}_sort_order`} value={String(index)} />
              <input type="hidden" name={`card_${index}_enabled`} value={card.enabled ? "true" : "false"} />

              <div className="grid gap-3 min-[1280px]:grid-cols-2">
                <CmsField
                  label="Customer name"
                  name={`card_${index}_author_name`}
                  defaultValue={card.authorName}
                  onChange={(event) => updateCard(index, { authorName: event.target.value })}
                />
                <CmsSelectField
                  label="Star rating"
                  name={`card_${index}_rating`}
                  defaultValue={String(card.rating)}
                  options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} stars` }))}
                />              </div>
              <CmsTextAreaField
                label="Review text (max 200 chars)"
                name={`card_${index}_body`}
                defaultValue={card.body}
                onChange={(event) => updateCard(index, { body: event.target.value.slice(0, 200) })}
              />
              <p className="text-xs text-[var(--platform-text-muted)]">{card.body.length}/200</p>

              <ShelfProductReplaceEditor
                label="Linked product"
                slotCount={1}
                selectedSlugs={[card.productSlug]}
                browseCatalog={browseCatalog}
                onChange={(slugs) => {
                  const slug = slugs[0] ?? "";
                  updateCard(index, { productSlug: slug });
                }}
              />
              <input type="hidden" name={`card_${index}_product_slug`} value={card.productSlug} />

              <CmsField
                label="Manual link override (optional if product linked)"
                name={`card_${index}_href_override`}
                defaultValue={card.hrefOverride}
                onChange={(event) => updateCard(index, { hrefOverride: event.target.value })}
              />
              <p className="text-xs text-[var(--platform-text-muted)]">
                View product link defaults to{" "}
                {card.productSlug ? `/product/${card.productSlug}` : product ? `/product/${product.slug}` : "—"}
              </p>

              <CmsImageField
                label="Avatar override (optional — defaults to product image)"
                name={`card_${index}_avatar`}
                altName={`card_${index}_avatar_alt`}
                defaultValue={card.avatarSrc}
                defaultAlt={card.avatarAlt}
                spec={CMS_IMAGE_SPECS.testimonialAvatar}
                onUpload={uploadImage}
                onPreviewChange={(src) => updateCard(index, { avatarSrc: src })}
                onUploadingChange={onUploadingChange}
              />
            </fieldset>
          );
        })}
      </div>
    </form>
  );
}
