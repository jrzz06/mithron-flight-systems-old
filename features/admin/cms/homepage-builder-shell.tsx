"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HomepageBuilderShell({
  editor,
  sectionPreview,
  fullPagePreview
}: {
  editor: ReactNode;
  sectionPreview: ReactNode;
  fullPagePreview: ReactNode;
}) {
  const [tab, setTab] = useState<"section" | "full">("section");

  return (
    <div
      data-homepage-builder-shell
      className="grid min-h-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto border-b border-[var(--platform-border)] p-5 lg:border-b-0 lg:border-r">
        {editor}
      </div>

      <div className="flex max-h-[calc(100vh-10rem)] min-h-0 flex-col gap-4 overflow-hidden p-5">
        <div className="flex items-center gap-1 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-1">
          {([
            ["section", "Section preview"],
            ["full", "Full page"]
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-[8px] px-3 py-2 text-xs font-medium transition",
                tab === key
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-sm"
                  : "text-[var(--platform-text-muted)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          {tab === "section" ? sectionPreview : fullPagePreview}
        </div>
      </div>
    </div>
  );
}
