import type { HomepageShelfCms } from "@/config/homepage-cms";
import type { CmsMiniCarouselSlide, HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";
import type { Product } from "@/config/types";
import { mapProductToReplaceItem, type ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import {
  pickHomeMiniCarouselItems,
  resolveHomeMiniCarouselItems
} from "@/lib/home/mini-carousel";
import {
  CMS_SHELF_KEY_TO_ID,
  padShelfSlugs,
  resolveEffectiveShelfProducts,
  resolveEffectiveShelfSlugs,
  type HomepageShelfId
} from "@/lib/home/shelf-product-resolution";

export type HomepageSlotProduct = ShelfSlotProductItem;

export type SlotAssignmentSource = "pinned" | "inferred" | "missing";

export type SlotAssignmentState = {
  position: number;
  slug: string;
  product: HomepageSlotProduct | null;
  source: SlotAssignmentSource;
};

export type MiniCarouselSlotAssignment = SlotAssignmentState & {
  slideId: string;
  heading: string;
  description: string;
  ctaLabel: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  enabled: boolean;
};

export type MiniCarouselEditorState = {
  enabled: boolean;
  slots: MiniCarouselSlotAssignment[];
  hasInferredAssignments: boolean;
};

function shelfSlotSource(
  cmsShelf: HomepageShelfCms,
  index: number,
  slug: string,
  product: Product | undefined
): SlotAssignmentSource {
  if (!slug) return "missing";
  const stored = padShelfSlugs(cmsShelf.productSlugs, SHELF_PRODUCT_CARD_SLOTS);
  const hasStoredAssignments = cmsShelf.productSlugs.filter(Boolean).length > 0;
  if (hasStoredAssignments && stored[index] === slug) return "pinned";
  if (hasStoredAssignments && cmsShelf.productSlugs.includes(slug)) return "pinned";
  if (!hasStoredAssignments && product) return "inferred";
  if (hasStoredAssignments && !product) return "pinned";
  return product ? "inferred" : "missing";
}

export function resolveShelfSlotAssignments(
  shelfId: HomepageShelfId,
  cmsShelf: HomepageShelfCms,
  products: Product[],
  slotCount = SHELF_PRODUCT_CARD_SLOTS
): SlotAssignmentState[] {
  const slugs = resolveEffectiveShelfSlugs(shelfId, cmsShelf, products, slotCount);
  const resolvedProducts = resolveEffectiveShelfProducts(shelfId, cmsShelf, products, slotCount);

  return slugs.map((slug, index) => {
    const catalogProduct = resolvedProducts[index];
    const product = catalogProduct ? mapProductToReplaceItem(catalogProduct) : null;
    return {
      position: index,
      slug,
      product,
      source: shelfSlotSource(cmsShelf, index, slug, catalogProduct)
    };
  });
}

function slideFromProduct(product: Product, index: number): CmsMiniCarouselSlide {
  return {
    id: `inferred-${product.slug}-${index}`,
    enabled: true,
    productSlug: product.slug,
    heading: product.name,
    description: product.tagline ?? "",
    ctaLabel: "View",
    href: `/product/${product.slug}`,
    imageSrc: product.image?.src ?? "",
    imageAlt: product.image?.alt ?? product.name,
    sortOrder: index
  };
}

function miniCarouselSlotSource(
  storedSlides: CmsMiniCarouselSlide[],
  index: number,
  slug: string,
  usingInferredCatalog: boolean
): SlotAssignmentSource {
  if (!slug) return "missing";
  if (usingInferredCatalog) return "inferred";
  const stored = storedSlides[index];
  if (stored?.productSlug === slug) return "pinned";
  if (storedSlides.some((slide) => slide.productSlug === slug)) return "pinned";
  return "inferred";
}

export function resolveMiniCarouselSlotAssignments(
  miniCarousel: HomepageCmsV2Content["miniCarousel"],
  products: Product[]
): MiniCarouselSlotAssignment[] {
  const storedSlides = miniCarousel.slides
    .filter((slide) => slide.enabled !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const usingInferredCatalog = storedSlides.length === 0;
  const effectiveItems = resolveHomeMiniCarouselItems(products, miniCarousel);

  if (usingInferredCatalog) {
    const inferred = pickHomeMiniCarouselItems(products);
    return inferred.map((item, index) => {
      const slug = item.itemKey.replace(/-\d+$/, "");
      const product = products.find((entry) => entry.slug === slug);
      const mapped = product ? mapProductToReplaceItem(product) : null;
      return {
        position: index,
        slug: product?.slug ?? slug,
        product: mapped,
        source: "inferred" as const,
        slideId: item.itemKey,
        heading: item.label,
        description: item.fullLabel,
        ctaLabel: "View",
        href: item.href,
        imageSrc: item.media.src,
        imageAlt: item.media.alt ?? item.label,
        enabled: true
      };
    });
  }

  return storedSlides.map((slide, index) => {
    const product = slide.productSlug ? products.find((entry) => entry.slug === slide.productSlug) : undefined;
    const effective = effectiveItems[index];
    const slug = slide.productSlug || (product?.slug ?? "");
    return {
      position: index,
      slug,
      product: product ? mapProductToReplaceItem(product) : null,
      source: miniCarouselSlotSource(storedSlides, index, slug, false),
      slideId: slide.id || `cms-slide-${index}`,
      heading: slide.heading.trim() || effective?.label || product?.name || "",
      description: slide.description.trim() || effective?.fullLabel || "",
      ctaLabel: slide.ctaLabel.trim() || "View",
      href: slide.href.trim() || effective?.href || (product ? `/product/${product.slug}` : "/products"),
      imageSrc: slide.imageSrc.trim() || product?.image?.src || effective?.media.src || "",
      imageAlt: slide.imageAlt.trim() || product?.image?.alt || slide.heading,
      enabled: slide.enabled !== false
    };
  });
}

export function resolveMiniCarouselEditorState(
  miniCarousel: HomepageCmsV2Content["miniCarousel"],
  products: Product[]
): MiniCarouselEditorState {
  const slots = resolveMiniCarouselSlotAssignments(miniCarousel, products);
  return {
    enabled: miniCarousel.enabled !== false,
    slots,
    hasInferredAssignments: slots.some((slot) => slot.source === "inferred")
  };
}

export function buildMiniCarouselSlidesFromAssignments(
  assignments: MiniCarouselSlotAssignment[],
  existingSlides: CmsMiniCarouselSlide[] = []
): CmsMiniCarouselSlide[] {
  return assignments
    .filter((slot) => slot.slug || slot.enabled)
    .map((slot, index) => {
      const existing = existingSlides.find((slide) => slide.id === slot.slideId);
      return {
        id: existing?.id && !slot.slideId.startsWith("inferred-") ? existing.id : `slide-${slot.slug}-${Date.now()}-${index}`,
        enabled: slot.enabled,
        productSlug: slot.slug,
        heading: slot.heading,
        description: slot.description,
        ctaLabel: slot.ctaLabel,
        href: slot.href,
        imageSrc: slot.imageSrc,
        imageAlt: slot.imageAlt,
        sortOrder: index
      };
    });
}

function buildPinnedShelfSlugs(assignments: SlotAssignmentState[]): string[] {
  return assignments.map((slot) => slot.slug).filter(Boolean);
}

export function buildPinnedMiniCarouselSlides(assignments: MiniCarouselSlotAssignment[]): CmsMiniCarouselSlide[] {
  return buildMiniCarouselSlidesFromAssignments(assignments);
}

export { CMS_SHELF_KEY_TO_ID };
