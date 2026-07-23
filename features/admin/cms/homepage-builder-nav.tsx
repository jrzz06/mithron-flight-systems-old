"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GalleryHorizontal,
  Images,
  LayoutTemplate,
  Newspaper,
  Rows3,
  Star,
  Store
} from "lucide-react";
import {
  getBuilderSectionLabel,
  homepageSectionRegistry,
  type CmsEditorKind,
  type HomepageSectionId
} from "@/config/homepage-section-registry";
import { shouldShowInHomepageOutline } from "@/lib/cms/section-content-status";
import { cn } from "@/lib/utils";

const MISSION_IDS = new Set<HomepageSectionId>(["mission-agri", "mission-city"]);

function iconForKind(kind: CmsEditorKind) {
  switch (kind) {
    case "hero-carousel":
      return GalleryHorizontal;
    case "product-shelf":
      return Store;
    case "mini-carousel":
      return Rows3;
    case "inter-shelf-banner":
    case "full-viewport-banner":
      return Images;
    case "mission-world":
      return LayoutTemplate;
    case "reviews-section":
      return Star;
    case "related-articles":
      return Newspaper;
    default:
      return LayoutTemplate;
  }
}

export function HomepageBuilderNav({
  activeSectionId,
  sectionStatus
}: {
  activeSectionId?: HomepageSectionId;
  sectionStatus?: Partial<
    Record<HomepageSectionId, { dirty?: boolean; published?: boolean; contentReady?: boolean; updatedAt?: string | null }>
  >;
}) {
  const pathname = usePathname();
  const isHub = pathname === "/admin/cms";

  return (
    <nav
      data-homepage-builder-nav
      data-cms-outline-nav
      className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-2"
      aria-label="Homepage sections"
    >
      <p className="hidden px-2 py-1 type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)] min-[1600px]:block">
        Outline
      </p>
      {homepageSectionRegistry.map((section) => {
        if (!shouldShowInHomepageOutline(section.id, sectionStatus?.[section.id])) return null;
        if (MISSION_IDS.has(section.id) && section.id === "mission-city") return null;

        if (section.id === "mission-agri") {
          const missions = homepageSectionRegistry.filter(
            (entry) => MISSION_IDS.has(entry.id) && shouldShowInHomepageOutline(entry.id, sectionStatus?.[entry.id])
          );
          if (!missions.length) return null;
          return (
            <div key="mission-worlds" className="grid gap-0.5">
              <p className="hidden px-2 pt-2 type-badge font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)] min-[1600px]:block">
                Mission Worlds
              </p>
              {missions.map((mission) => (
                <OutlineItem
                  key={mission.id}
                  sectionId={mission.id}
                  href={`/admin/cms/${mission.id}`}
                  label={getBuilderSectionLabel(mission.id)}
                  editorKind={mission.editorKind}
                  active={activeSectionId === mission.id}
                />
              ))}
            </div>
          );
        }

        return (
          <OutlineItem
            key={section.id}
            sectionId={section.id}
            href={`/admin/cms/${section.id}`}
            label={getBuilderSectionLabel(section.id)}
            editorKind={section.editorKind}
            active={!isHub && activeSectionId === section.id}
          />
        );
      })}
    </nav>
  );
}

function OutlineItem({
  sectionId,
  href,
  label,
  editorKind,
  active
}: {
  sectionId: HomepageSectionId;
  href: string;
  label: string;
  editorKind: CmsEditorKind;
  active?: boolean;
}) {
  const Icon = iconForKind(editorKind);

  return (
    <Link
      href={href}
      title={label}
      data-cms-section-id={sectionId}
      data-cms-outline-item={sectionId}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "flex items-start gap-2 rounded-[6px] px-2 py-1.5 text-sm transition duration-150",
        "min-[1280px]:max-[1599px]:justify-center min-[1280px]:max-[1599px]:px-1.5",
        active
          ? "bg-[var(--platform-accent-soft)] font-medium text-[var(--platform-text-primary)] ring-1 ring-[var(--platform-accent)]/30"
          : "text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)]"
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate min-[1280px]:max-[1599px]:hidden">{label}</span>
    </Link>
  );
}
