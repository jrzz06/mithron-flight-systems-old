import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { Product } from "@/config/types";
import type { ProductPageReview } from "@/lib/product-reviews/types";
import {
  HomeClientTestimonialsCarousel
} from "@/sections/home/home-client-testimonials-carousel";
import type { TestimonialCarouselCardItem } from "@/components/editorial/testimonial-carousel-card";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import styles from "./home-client-testimonials-section.module.css";

export const HOME_TESTIMONIAL_SHOWCASE_COUNT = 6;

export type HomeTestimonialItem = TestimonialCarouselCardItem;

export function pickHomeTestimonialItems(reviews: ProductPageReview[], products: Product[], maxCount = HOME_TESTIMONIAL_SHOWCASE_COUNT) {
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const items: HomeTestimonialItem[] = [];

  for (const review of reviews) {
    if (!review.productSlug) continue;
    const product = productBySlug.get(review.productSlug);
    const imageSrc = product?.image?.src?.trim();
    if (!product || !imageSrc) continue;

    const productName = review.productName?.trim() || product.name || review.productSlug;
    items.push({
      id: review.id,
      authorName: review.authorName.trim() || "Verified Customer",
      body: review.body.trim(),
      rating: Math.max(1, Math.min(5, Math.round(review.rating || 5))),
      productName,
      productSlug: review.productSlug,
      productHref: `/product/${review.productSlug}`,
      productImageUrl: imageSrc,
      productImageAlt: `${productName} product image`
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
