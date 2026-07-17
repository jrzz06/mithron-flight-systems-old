"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Link2, Underline } from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/notifications/prompt-dialog";
import { notify } from "@/lib/feedback/notify";

export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  return (
    <>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-1 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-raised)] p-1 shadow-[var(--platform-shadow-md)]"
      >
        <button type="button" aria-label="Bold" className="platform-btn-ghost platform-btn-sm !min-h-8 !w-8 !px-0" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Italic" className="platform-btn-ghost platform-btn-sm !min-h-8 !w-8 !px-0" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Underline" className="platform-btn-ghost platform-btn-sm !min-h-8 !w-8 !px-0" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Link"
          className="platform-btn-ghost platform-btn-sm !min-h-8 !w-8 !px-0"
          onClick={() => setLinkOpen(true)}
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </BubbleMenu>
      <PromptDialog
        open={linkOpen}
        title="Insert link"
        description="Only http and https links are allowed."
        placeholder="https://"
        initialValue="https://"
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
    </>
  );
}
