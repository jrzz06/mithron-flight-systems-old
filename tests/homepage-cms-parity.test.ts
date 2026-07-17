import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getHomepageBaseCmsContent, resolveEffectiveHomepageCmsContent, resolveHomepageLandingState, resolveShelfEditorState } from "@/lib/home/homepage-resolution";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";
import type { Product } from "@/config/types";

const editorSource = readFileSync("features/admin/cms/cms-section-editor.tsx", "utf8");
const actionsSource = readFileSync("app/admin/cms/actions.ts", "utf8");

function product(partial: Partial<Product> & Pick<Product, "slug" | "name" | "category">): Product {
  return {
    tagline: partial.tagline ?? partial.name,
    price: partial.price ?? 1000,
    interests: partial.interests ?? ["drone"],
    image: partial.image ?? { src: "/test.png", alt: partial.name },
    hero: partial.image ?? { src: "/test.png", alt: partial.name },
    gallery: [],
    variants: partial.variants ?? [],
    bundles: [],
    story: [],
    specs: partial.specs ?? {},
    anchors: [],
    productUrl: `/product/${partial.slug}`,
    ...partial
  };
}

describe("homepage CMS storefront parity", () => {
  it("uses storefront base layer as default homepage content", () => {
    expect(getDefaultHomepageCmsContent().shelves.droneWorld.title).toBe("Drone World");
    expect(getDefaultHomepageCmsContent()).toEqual(getHomepageBaseCmsContent());
  });

  it("does not expose legacy guide card fields in defaults", () => {
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld as Record<string, unknown>;
    expect(shelf.guideLabel).toBeUndefined();
    expect(shelf.guideTitle).toBeUndefined();
  });

  it("resolver landing state matches shelf editor config", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones" }),
      product({ slug: "drone-b", name: "Drone B", category: "Agri Drones" })
    ];
    const cms = resolveEffectiveHomepageCmsContent({});
    const landing = resolveHomepageLandingState(cms);
    const editor = resolveShelfEditorState("droneWorld", cms, catalog);

    expect(editor.config.title).toBe(landing.shelfConfigs["drone-world"].title);
    expect(editor.chapter.id).toBe("drone-world");
  });

  it("preserves v2 payload keys when saving v1 homepage content", () => {
    expect(actionsSource).toContain("draftV2: homepageStored.draftV2");
    expect(actionsSource).toContain("v2: homepageStored.v2");
  });

  it("removes guide card editor fields from CMS shelf form", () => {
    expect(editorSource).not.toContain("guide_label");
    expect(editorSource).not.toContain("Buying Guides");
    expect(editorSource).not.toContain("Guide card (manual)");
  });
});
