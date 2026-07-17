import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";
import { Callout } from "@/lib/editor/extensions/callout";
import { Downloads } from "@/lib/editor/extensions/downloads";
import { EditorImage } from "@/lib/editor/extensions/editor-image";
import { FeatureCard } from "@/lib/editor/extensions/feature-card";
import { Specification } from "@/lib/editor/extensions/specification";

export type EditorExtensionOptions = {
  placeholder?: string;
  characterLimit?: number;
};

export function createEditorExtensions(options: EditorExtensionOptions = {}): Extensions {
  const { placeholder = "Start writing...", characterLimit } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      bulletList: { keepMarks: true },
      orderedList: { keepMarks: true },
      codeBlock: { HTMLAttributes: { class: "editor-code-block" } },
      blockquote: { HTMLAttributes: { class: "editor-blockquote" } },
      horizontalRule: { HTMLAttributes: { class: "editor-divider" } }
    }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      validate: (url) => /^https?:\/\//i.test(url),
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
        class: "editor-link"
      }
    }),
    EditorImage.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Callout,
    FeatureCard,
    Specification,
    Downloads,
    Placeholder.configure({ placeholder }),
    CharacterCount.configure(characterLimit ? { limit: characterLimit } : {})
  ];
}
