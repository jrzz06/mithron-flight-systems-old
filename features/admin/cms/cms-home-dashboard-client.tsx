"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { toggleCmsSectionVisibilityFormAction } from "@/app/admin/cms/actions";
import { CmsStatusPill } from "@/components/admin/cms/cms-field";
import { getBuilderSectionLabel } from "@/config/homepage-section-registry";
import type { CmsDashboardSectionCard } from "@/features/admin/cms/cms-home-dashboard";

const timedToggleCmsSectionVisibilityFormAction = wrapServerAction(toggleCmsSectionVisibilityFormAction, { label: "Toggle CMS section" });

export function CmsHomeDashboardClient({ sections }: { sections: CmsDashboardSectionCard[] }) {
  return (
    <div data-cms-home-dashboard className="grid gap-3">
      {sections.map((card) => (
        <article
          key={card.id}
          data-cms-section-card={card.id}
          className="mithron-elevated-card grid gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 md:grid-cols-[120px_minmax(0,1fr)_auto]"
        >
          <div className="relative aspect-[16/10] overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
            {card.thumbnailSrc ? (
              <Image src={card.thumbnailSrc} alt="" fill sizes="120px" className="object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-[11px] text-[var(--platform-text-muted)]">No image</div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">{getBuilderSectionLabel(card.id)}</h3>
              <CmsStatusPill status={card.status} />
              {!card.isVisible ? (
                <span className="rounded-full border border-[var(--platform-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                  Hidden
                </span>
              ) : null}
              {card.hasDraftChanges ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                  Draft changes
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--platform-text-secondary)]">{card.description}</p>
            {card.updatedAt ? (
              <p className="mt-2 text-[11px] text-[var(--platform-text-muted)]">Updated {card.updatedAt}</p>
            ) : null}
          </div>

          <div className="flex items-start gap-1.5 md:flex-col md:items-end">
            {card.editable ? (
              <Link
                href={`/admin/cms/${card.id}`}
                className="platform-btn-primary platform-btn-sm inline-flex items-center gap-1.5"
                aria-label={`Edit ${getBuilderSectionLabel(card.id)}`}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Link>
            ) : (
              <Link href="/admin/cms?page=footer-page" className="platform-btn-secondary platform-btn-sm inline-flex items-center gap-1.5">
                Open footer editor
              </Link>
            )}
            <form action={timedToggleCmsSectionVisibilityFormAction}>
              <input type="hidden" name="section_key" value={card.visibilityKey} />
              <input type="hidden" name="is_visible" value={card.isVisible ? "false" : "true"} />
              <button
                type="submit"
                className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1.5"
                aria-label={card.isVisible ? `Hide ${getBuilderSectionLabel(card.id)}` : `Show ${getBuilderSectionLabel(card.id)}`}
                title={card.isVisible ? "Hide" : "Show"}
              >
                {card.isVisible ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">{card.isVisible ? "Hide" : "Show"}</span>
              </button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
