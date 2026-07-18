"use client";

import { useEffect, useRef } from "react";
import { hydrateEditorAtomBlocks } from "@/lib/editor/hydrate-rendered-content";
import { cn } from "@/lib/utils";
import "@/components/editor/editor-display.css";

export function EditorRenderedContentClient({
  safeHtml,
  className,
  style
}: {
  safeHtml: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    hydrateEditorAtomBlocks(rootRef.current);
  }, [safeHtml]);

  if (!safeHtml) return null;

  return (
    <div
      ref={rootRef}
      className={cn("editor-rendered-content", className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
