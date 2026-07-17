"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CmsWorkspaceShell({
  nav,
  editor,
  preview,
  className
}: {
  nav?: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
  className?: string;
}) {
  return (
    <div data-cms-workspace-shell className={cn("grid gap-4", className)}>
      {nav ? <div data-cms-workspace-nav>{nav}</div> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div
          data-cms-editor-pane
          className="min-w-0 overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)]"
        >
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-4 md:p-5">{editor}</div>
        </div>
        <div
          data-cms-preview-pane
          className="min-w-0 lg:sticky lg:top-20 lg:self-start"
        >
          {preview}
        </div>
      </div>
    </div>
  );
}
