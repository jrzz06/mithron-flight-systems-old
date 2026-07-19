import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { CmsTestimonialCard } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import {
  HomeClientTestimonialsCarousel
} from "@/sections/home/home-client-testimonials-carousel";
import type { TestimonialCarouselCardItem } from "@/components/editorial/testimonial-carousel-card";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import styles from "./home-client-testimonials-section.module.css";

export const HOME_TESTIMONIAL_SHOWCASE_COUNT = 6;

export type HomeTestimonialItem = TestimonialCarouselCardItem;

/** Resolve homepage testimonials from CMS-owned cards (1A). */
export function pickHomeTestimonialItemsFromCms(
  cards: CmsTestimonialCard[],
  products: Product[],
  maxCount = HOME_TESTIMONIAL_SHOWCASE_COUNT
): HomeTestimonialItem[] {
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const sorted = [...cards]
    .filter((card) => card.enabled !== false)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const items: HomeTestimonialItem[] = [];
  for (const card of sorted) {
    const authorName = card.authorName.trim();
    const body = card.body.trim();
    if (!authorName || !body) continue;

    const product = card.productSlug ? productBySlug.get(card.productSlug) : undefined;
    const productHref =
      card.hrefOverride.trim() ||
      (card.productSlug ? `/product/${card.productSlug}` : "");
    if (!productHref) continue;

    // Referential integrity: deleted product may leave only the slug; skip if no image resolves.
    const productName = product?.name?.trim() || card.productSlug.trim();
    if (!productName) continue;
    const avatarOverride = card.avatarSrc.trim();
    const productImageUrl = avatarOverride || product?.image?.src?.trim() || "";
    if (!productImageUrl) continue;

    items.push({
      id: card.id,
      authorName,
      body: body.slice(0, 200),
      rating: Math.max(1, Math.min(5, Math.round(card.rating || 5))),
      productName,
      productSlug: card.productSlug || "",
      productHref,
      productImageUrl,
      productImageAlt: card.avatarAlt.trim() || `${productName} product image`
    });

    if (items.length >= maxCount) break;
  }

  return items;
}

export function HomeClientTestimonialsSection({
  items,
  header
}: {
  items: HomeTestimonialItem[];
  header: HomepageCmsContent["testimonials"];
}) {
  if (!items.length) return null;

  return (
    <section
      id="home-client-testimonials"
      className={styles.section}
      data-testid="home-client-testimonials"
      data-mission-motion="skip"
      aria-labelledby="home-client-testimonials-title"
    >
      <SoftErrorBoundary label="Testimonials">
        <HomeClientTestimonialsCarousel
          items={items}
          title={header.title}
          titleAccent={header.titleAccent}
          lead={header.lead}
        />
      </SoftErrorBoundary>
    </section>
  );
}
