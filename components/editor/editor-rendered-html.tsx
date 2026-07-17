import { prepareEditorHtmlForDisplay } from "@/lib/editor/prepare-html";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import "@/components/editor/RichTextEditor/editor.css";

export function EditorRenderedHtml({
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
    <div
      className={cn("editor-rendered-content", className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
