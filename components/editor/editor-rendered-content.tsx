import { prepareEditorHtmlForDisplay } from "@/lib/editor/prepare-html";
import { EditorRenderedContentClient } from "@/components/editor/editor-rendered-content-client";
import type { CSSProperties } from "react";

export function EditorRenderedContent({
  html,
  className,
  style
}: {
  html: string;
  className?: string;
  style?: CSSProperties;
}) {
  const safeHtml = prepareEditorHtmlForDisplay(html);
  if (!safeHtml) return null;

  return (
    <EditorRenderedContentClient safeHtml={safeHtml} className={className} style={style} />
  );
}
