"use client";

import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { Editor } from "@tiptap/react";

export type SlashCommandItem = {
  title: string;
  command: (editor: Editor) => void;
};

export const slashCommandItems: SlashCommandItem[] = [
  { title: "Heading", command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: "Table", command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Image", command: (editor) => editor.chain().focus().run() },
  { title: "Warning", command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { variant: "warning", title: "Warning" }, content: [{ type: "paragraph" }] }).run() },
  { title: "Information", command: (editor) => editor.chain().focus().insertContent({ type: "callout", attrs: { variant: "information", title: "Information" }, content: [{ type: "paragraph" }] }).run() },
  { title: "Checklist", command: (editor) => editor.chain().focus().toggleTaskList().run() },
  {
    title: "Specification",
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: "specification",
          attrs: {
            rows: [
              { label: "Payload", value: "10 kg" },
              { label: "Flight Time", value: "45 min" }
            ]
          }
        })
        .run()
  },
  {
    title: "Feature Card",
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: "featureCard",
          attrs: { icon: "sparkles", title: "Feature title", description: "Describe the feature." }
        })
        .run()
  },
  {
    title: "Downloads",
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: "downloads",
          attrs: { items: [{ label: "Datasheet", href: "https://", kind: "pdf" }] }
        })
        .run()
  }
];

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommandItem }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        }
      }
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) =>
          slashCommandItems.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10),
        render: () => {
          let element: HTMLDivElement | null = null;

          return {
            onStart: (props: { clientRect?: (() => DOMRect | null) | null; items: SlashCommandItem[]; command: (item: SlashCommandItem) => void }) => {
              element = document.createElement("div");
              element.className =
                "z-50 min-w-[220px] overflow-hidden rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-raised)] p-1 shadow-[var(--platform-shadow-md)]";
              document.body.appendChild(element);
              props.items.forEach((item) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className =
                  "block w-full rounded-[8px] px-3 py-2 text-left text-sm text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-muted)]";
                button.textContent = item.title;
                button.onclick = () => props.command(item);
                element?.appendChild(button);
              });
              const rect = props.clientRect?.();
              if (rect && element) {
                element.style.position = "absolute";
                element.style.left = `${rect.left}px`;
                element.style.top = `${rect.bottom + 6}px`;
              }
            },
            onUpdate(props: { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void }) {
              if (!element) return;
              element.innerHTML = "";
              props.items.forEach((item) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className =
                  "block w-full rounded-[8px] px-3 py-2 text-left text-sm text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-muted)]";
                button.textContent = item.title;
                button.onclick = () => props.command(item);
                element?.appendChild(button);
              });
            },
            onExit() {
              element?.remove();
              element = null;
            }
          };
        }
      })
    ];
  }
});
