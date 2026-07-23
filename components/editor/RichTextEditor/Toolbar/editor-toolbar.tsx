import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Underline,
  Undo2
} from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/notifications/prompt-dialog";
import { isProductDescriptionDocumentType } from "@/lib/editor/ai-prompts";
import { notify } from "@/lib/feedback/notify";
import { cn } from "@/lib/utils";

function ToolbarButton({
  active,
  label,
  onClick,
  children,
  disabled
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-transparent transition-colors",
        active
          ? "bg-[var(--platform-accent-soft)] text-[var(--platform-text-primary)]"
          : "text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)] hover:text-[var(--platform-text-primary)]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({
  editor,
  documentType,
  onInsertImage,
  onToggleFullscreen,
  isFullscreen
}: {
  editor: Editor;
  documentType?: string;
  onInsertImage?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const hideColorControls = isProductDescriptionDocumentType(documentType);

  function setLink() {
    setLinkOpen(true);
  }

  return (
    <div data-editor-toolbar className="sticky top-0 z-20 border-b border-[var(--platform-border)] bg-[var(--platform-surface-raised)]">
      <div className="flex flex-wrap items-center gap-1 px-2 py-2">
        <ToolbarButton label="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
          <span className="type-badge font-semibold">P</span>
        </ToolbarButton>
        <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
          <Heading4 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--platform-border)]" aria-hidden="true" />
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        {editor.isActive("link") ? (
          <ToolbarButton label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
            <span className="type-badge font-semibold">Unlink</span>
          </ToolbarButton>
        ) : null}
        <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().run()}>
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--platform-border)] px-2 py-2">
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--platform-border)]" aria-hidden="true" />
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--platform-border)]" aria-hidden="true" />
        <ToolbarButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>
        {!hideColorControls ? (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--platform-border)]" aria-hidden="true" />
            <input
              type="color"
              aria-label="Text color"
              className="h-8 w-8 cursor-pointer rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)]"
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
            />
            <ToolbarButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#f5d565" }).run()}>
              <Highlighter className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        ) : null}
        {onInsertImage ? (
          <ToolbarButton label="Insert image" onClick={onInsertImage}>
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        ) : null}
        <span className="mx-1 h-5 w-px bg-[var(--platform-border)]" aria-hidden="true" />
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        {onToggleFullscreen ? (
          <button type="button" onClick={onToggleFullscreen} className="platform-btn-ghost platform-btn-sm ml-auto">
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
        ) : null}
      </div>
      <PromptDialog
        open={linkOpen}
        title="Insert link"
        description="Only http and https links are allowed."
        placeholder="https://"
        initialValue={(editor.getAttributes("link").href as string | undefined) ?? "https://"}
        confirmLabel="Insert"
        onClose={() => setLinkOpen(false)}
        onConfirm={(value) => {
          const url = value.trim();
          if (!url) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setLinkOpen(false);
            return;
          }
          if (!/^https?:\/\//i.test(url)) {
            notify.error("Only http and https links are allowed.", { source: "editor" });
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          setLinkOpen(false);
        }}
      />
    </div>
  );
}
