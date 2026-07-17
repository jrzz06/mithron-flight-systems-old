import Image from "@tiptap/extension-image";

export const EditorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaAssetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-asset-id"),
        renderHTML: (attributes) =>
          attributes.mediaAssetId ? { "data-media-asset-id": attributes.mediaAssetId } : {}
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") ?? "",
        renderHTML: (attributes) =>
          attributes.caption ? { "data-caption": attributes.caption } : {}
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width");
          return width ? Number.parseInt(width, 10) || null : null;
        },
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {})
      }
    };
  }
});
