import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CmsEditorSection({
  title,
  description,
  children,
  className
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-4", className)} data-cms-editor-section>
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">{title}</h3>
        {description ? <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
