"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getBuilderSectionLabel,
  homepageSectionRegistry,
  type HomepageSectionId
} from "@/config/homepage-section-registry";
import { cn } from "@/lib/utils";

const MISSION_IDS = new Set<HomepageSectionId>(["mission-agri", "mission-city"]);

export function HomepageBuilderNav({ activeSectionId }: { activeSectionId?: HomepageSectionId }) {
  const pathname = usePathname();
  const isHub = pathname === "/admin/cms";

  return (
    <nav
      data-homepage-builder-nav
      className="flex flex-col gap-1 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-2"
      aria-label="Homepage sections"
    >
      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
        Homepage Builder
      </p>
      {homepageSectionRegistry.map((section) => {
        if (MISSION_IDS.has(section.id) && section.id === "mission-city") return null;

        if (section.id === "mission-agri") {
          return (
            <div key="mission-worlds" className="grid gap-0.5">
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                Mission Worlds
              </p>
              {homepageSectionRegistry
                .filter((entry) => MISSION_IDS.has(entry.id))
                .map((mission) => (
                  <NavLink
                    key={mission.id}
                    href={`/admin/cms/${mission.id}`}
                    label={getBuilderSectionLabel(mission.id)}
                    active={activeSectionId === mission.id}
                  />
                ))}
            </div>
          );
        }

        const href = section.editable ? `/admin/cms/${section.id}` : "/admin/cms?page=footer-page";
        return (
          <NavLink
            key={section.id}
            href={href}
            label={getBuilderSectionLabel(section.id)}
            active={!isHub && activeSectionId === section.id}
            indent={false}
          />
        );
      })}
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
  indent = false
}: {
  href: string;
  label: string;
  active?: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[6px] px-2 py-1.5 text-sm transition",
        indent && "ml-2",
        active
          ? "bg-[var(--platform-accent-soft)] font-medium text-[var(--platform-text-primary)]"
          : "text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)]"
      )}
    >
      {label}
    </Link>
  );
}
