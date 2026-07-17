import dynamic from "next/dynamic";

export const RichTextEditor = dynamic(
  () => import("@/components/editor/RichTextEditor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        data-rich-text-editor
        className="min-h-[220px] animate-pulse rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
      />
    )
  }
);

export type { RichTextEditorProps } from "@/components/editor/RichTextEditor";
