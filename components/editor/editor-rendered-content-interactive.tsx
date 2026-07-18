"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { hydrateEditorAtomBlocks } from "@/lib/editor/hydrate-rendered-content";
import { prepareEditorHtmlForDisplay } from "@/lib/editor/prepare-html";
import { cn } from "@/lib/utils";
import "@/components/editor/editor-display.css";

/** Client-only rich text renderer for admin interactive surfaces. */
export function EditorRenderedContentInteractive({
  html,
  className,
  style
}: {
  html: string;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => prepareEditorHtmlForDisplay(html), [html]);

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
