import { Node, mergeAttributes } from "@tiptap/core";

export type SpecificationRow = { label: string; value: string };

export const Specification = Node.create({
  name: "specification",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      rows: {
        default: [] as SpecificationRow[],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-rows") ?? "[]");
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-rows": JSON.stringify(attributes.rows ?? [])
        })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="specification"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "specification", class: "editor-specification" })
    ];
  }
});
