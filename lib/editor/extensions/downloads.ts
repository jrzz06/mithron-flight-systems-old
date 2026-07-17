import { Node, mergeAttributes } from "@tiptap/core";

export type DownloadItem = { label: string; href: string; kind: string };

export const Downloads = Node.create({
  name: "downloads",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      items: {
        default: [] as DownloadItem[],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-items") ?? "[]");
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-items": JSON.stringify(attributes.items ?? [])
        })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="downloads"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "downloads", class: "editor-downloads" })
    ];
  }
});
