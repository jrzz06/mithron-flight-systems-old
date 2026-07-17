import Link from "next/link";
import { Quote, Star } from "lucide-react";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import styles from "./testimonial-carousel-card.module.css";

export type TestimonialCarouselCardItem = {
  id: string;
  authorName: string;
  body: string;
  rating: number;
  productName: string;
  productSlug: string;
  productHref: string;
  productImageUrl: string;
  productImageAlt: string;
};

function StarRatingRow({ rating }: { rating: number }) {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));

  return (
    <div className={styles.starRow} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < clamped;
        return (
          <Star
            key={index}
            className={filled ? styles.star : `${styles.star} ${styles.starEmpty}`}
            aria-hidden="true"
            strokeWidth={filled ? 1.25 : 1.5}
            fill={filled ? "currentColor" : "none"}
          />
        );
      })}
    </div>
  );
}

export function TestimonialCarouselCard({ item }: { item: TestimonialCarouselCardItem }) {
  return (
    <article className={styles.card} data-testimonial-carousel-card>
      <div className={styles.cardTop}>
        <Quote className={styles.quoteIcon} size={44} strokeWidth={1.2} aria-hidden="true" />
        <StarRatingRow rating={item.rating} />
      </div>

      <p className={styles.body}>{item.body}</p>

      <footer className={styles.footer}>
        <Link
          href={item.productHref}
          className={styles.productLink}
          aria-label={`View ${item.productName}`}
          data-testid="testimonial-product-link"
        >
          <div className={styles.productThumb}>
            <MithronCardImage
              src={item.productImageUrl}
              alt={item.productImageAlt}
              sizes="48px"
              className={styles.productImage}
            />
          </div>
          <div className={styles.meta}>
            <p className={styles.name}>{item.authorName}</p>
            <p className={styles.productName}>{item.productName}</p>
            <p className={styles.viewProduct}>View product</p>
          </div>
        </Link>
      </footer>
    </article>
  );
}
