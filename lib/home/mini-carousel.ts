import type { MediaAsset, Product } from "@/config/types";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { productShelfSearchText } from "@/lib/home/shelf-product-resolution";
import { filterDroneWorldProducts } from "@/lib/product-shelf-classification";
import { sanitizeProductPreviewText } from "@/lib/product-preview-text";

export type HomeMiniCarouselItem = {
  itemKey: string;
  label: string;
  fullLabel: string;
  href: string;
  media: Pick<MediaAsset, "src" | "alt" | "responsive">;
  sourceState: "VERIFIED" | "FALLBACK";
};

const miniCarouselProductPriority = [
  "drone",
  "agri",
  "sprayer",
  "seed",
  "survey",
  "mapping",
  "surveillance",
  "camera",
  "controller",
  "battery",
  "propeller",
  "power",
  "gimbal"
];

function toSentenceCaseLabel(value: string) {
  const clean = sanitizeProductPreviewText(value);
  if (!clean) return "";
  return clean
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function formatMiniCarouselLabel(product: Product) {
  const source = (product.name || product.category || "Catalog")
    .replace(/[|[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = toSentenceCaseLabel(source);
  if (normalized.length <= 28) return normalized;

  if (product.category) {
    return toSentenceCaseLabel(product.category);
  }

  return normalized.slice(0, 26).replace(/\s+\S*$/, "");
}

function miniCarouselProductScore(product: Product) {
  const text = productShelfSearchText(product);
  const priorityIndex = miniCarouselProductPriority.findIndex((keyword) => text.includes(keyword));
  const productBias = text.includes("drone") ? 18 : 0;
  return (priorityIndex === -1 ? 0 : miniCarouselProductPriority.length - priorityIndex) + productBias;
}

export function pickHomeMiniCarouselItems(products: Product[]): HomeMiniCarouselItem[] {
  const carouselProducts = filterDroneWorldProducts(products);
  return carouselProducts
    .filter((product) => product.slug && product.image?.src)
    .map((product, index) => ({ product, index, score: miniCarouselProductScore(product) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 14)
    .map(({ product, index }) => ({
      itemKey: `${product.slug}-${index}`,
      label: formatMiniCarouselLabel(product),
      fullLabel: sanitizeProductPreviewText(product.name || product.category),
      href: `/product/${product.slug}`,
      media: product.image,
      sourceState: "VERIFIED" as const
    }));
}

export function resolveHomeMiniCarouselItems(
  products: Product[],
  miniCarousel: HomepageCmsV2Content["miniCarousel"]
): HomeMiniCarouselItem[] {
  const cmsSlides = miniCarousel.slides
    .filter((slide) => slide.enabled !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (cmsSlides.length) {
    return cmsSlides.flatMap((slide, index) => {
      const product = slide.productSlug ? products.find((entry) => entry.slug === slide.productSlug) : undefined;

      if (slide.productSlug && !product) {
        // Missing/unpublished: omit from storefront (no fake card). Admin shows warning.
        return [];
      }

      if (product) {
        const imageSrc = product.image?.src || slide.imageSrc.trim() || "";
        const label = formatMiniCarouselLabel(product);
        return [
          {
            itemKey: slide.id || `cms-slide-${index}`,
            label,
            fullLabel: sanitizeProductPreviewText(product.name || product.category),
            href: `/product/${product.slug}`,
            media: {
              src: imageSrc,
              alt: product.image?.alt || slide.imageAlt.trim() || label,
              responsive: product.image?.responsive
            },
            sourceState: imageSrc ? ("VERIFIED" as const) : ("FALLBACK" as const)
          }
        ];
      }

      const href = slide.href.trim() || "/products";
      const imageSrc = slide.imageSrc.trim() || "";
      const heading = slide.heading.trim() || "Featured";
      return [
        {
          itemKey: slide.id || `cms-slide-${index}`,
          label: heading,
          fullLabel: slide.description.trim() || heading,
          href,
          media: {
            src: imageSrc,
            alt: slide.imageAlt.trim() || heading,
            responsive: undefined
          },
          sourceState: imageSrc ? ("VERIFIED" as const) : ("FALLBACK" as const)
        }
      ];
    });
  }

  return pickHomeMiniCarouselItems(products);
}
