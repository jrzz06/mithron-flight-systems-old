"use client";

import type { Editor } from "@tiptap/react";
import type { EditorAiAction } from "@/lib/editor/types";
import {
  defaultEditorAiActions,
  isProductDescriptionDocumentType,
  productDescriptionAiActions
} from "@/lib/editor/ai-prompts";
import { notify } from "@/lib/feedback/notify";

function resolveAiActions(documentType?: string) {
  return isProductDescriptionDocumentType(documentType)
    ? productDescriptionAiActions()
    : defaultEditorAiActions();
}

function getSelectedText(editor: Editor, action: EditorAiAction) {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, "\n").trim();
  if (selectedText) return { from, to, text: selectedText };

  if (action === "normalize_structure") {
    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n").trim();
    if (!fullText) return null;
    return { from: 0, to: editor.state.doc.content.size, text: fullText };
  }

  return null;
}

export async function runEditorAiAction(editor: Editor, action: EditorAiAction, documentType?: string) {
  const selection = getSelectedText(editor, action);
  if (!selection) {
    notify.error(
      action === "normalize_structure"
        ? "Add description text before normalizing structure."
        : "Select text before using AI assistance.",
      { source: "editor" }
    );
    return;
  }

  const response = await fetch("/api/editor/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      text: selection.text,
      documentType
    })
  });

  const payload = (await response.json()) as { text?: string; html?: string; error?: string };
  if (!response.ok || (!payload.text && !payload.html)) {
    notify.error(payload.error ?? "AI assistance is unavailable.", { source: "editor" });
    return;
  }

  const content = payload.html?.trim() || payload.text || "";
  const chain = editor.chain().focus();
  if (isProductDescriptionDocumentType(documentType)) {
    chain.setTextSelection({ from: selection.from, to: selection.to }).unsetAllMarks();
  }
  chain.insertContentAt({ from: selection.from, to: selection.to }, content).run();
}

export function EditorAiMenu({ editor, documentType }: { editor: Editor; documentType?: string }) {
  const actions = resolveAiActions(documentType);

  return (
    <div className="flex flex-wrap gap-1 border-t border-[var(--platform-border)] px-2 py-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="platform-btn-ghost platform-btn-sm"
          onClick={() => void runEditorAiAction(editor, action.id, documentType)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
