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
    return cmsSlides.map((slide, index) => {
      const product = slide.productSlug ? products.find((entry) => entry.slug === slide.productSlug) : undefined;
      const href = slide.href.trim() || (product ? `/product/${product.slug}` : "/products");
      const imageSrc = slide.imageSrc.trim() || product?.image?.src || "";
      return {
        itemKey: slide.id || `cms-slide-${index}`,
        label: slide.heading.trim() || (product ? formatMiniCarouselLabel(product) : "Featured"),
        fullLabel: slide.description.trim() || slide.heading.trim() || product?.name || "Featured",
        href,
        media: {
          src: imageSrc,
          alt: slide.imageAlt.trim() || product?.image?.alt || slide.heading,
          responsive: product?.image?.responsive
        },
        sourceState: imageSrc ? "VERIFIED" as const : "FALLBACK" as const
      };
    });
  }

  return pickHomeMiniCarouselItems(products);
}
