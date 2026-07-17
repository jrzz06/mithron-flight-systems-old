import { Node, mergeAttributes } from "@tiptap/core";

type CalloutVariant = "warning" | "information" | "success";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "information",
        parseHTML: (element) => element.getAttribute("data-variant") ?? "information",
        renderHTML: (attributes) => ({ "data-variant": attributes.variant })
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") ?? "",
        renderHTML: (attributes) => (attributes.title ? { "data-title": attributes.title } : {})
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "editor-callout" }), 0];
  }
});
