import { Node, mergeAttributes } from "@tiptap/core";

export const FeatureCard = Node.create({
  name: "featureCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      icon: { default: "sparkles" },
      title: { default: "Feature title" },
      description: { default: "" }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="feature-card"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "feature-card",
        class: "editor-feature-card",
        "data-icon": HTMLAttributes.icon,
        "data-title": HTMLAttributes.title,
        "data-description": HTMLAttributes.description
      })
    ];
  }
});
