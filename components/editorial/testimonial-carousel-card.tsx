import Link from "next/link";
import { Quote, Star } from "lucide-react";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import { cn } from "@/lib/utils";
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
    <div className={cn(styles.starRow, "inline-flex shrink-0 items-center gap-0.5")} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < clamped;
        return (
          <Star
            key={index}
            className={cn(
              "h-5 w-5 sm:h-6 sm:w-6",
              filled ? styles.star : cn(styles.star, styles.starEmpty)
            )}
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
    <article
      className={cn(
        styles.card,
        "flex h-full flex-col justify-between p-4 sm:p-6 lg:p-8"
      )}
      data-testimonial-carousel-card
    >
      <div className="flex items-start justify-between gap-3 sm:gap-3.5">
        <Quote
          className={cn(styles.quoteIcon, "h-5 w-5 shrink-0 sm:h-6 sm:w-6")}
          strokeWidth={1.2}
          aria-hidden="true"
        />
        <StarRatingRow rating={item.rating} />
      </div>

      <p className={cn(styles.body, "mt-3 line-clamp-3 text-xs sm:mt-4 sm:line-clamp-4 sm:text-sm md:text-base")}>
        {item.body}
      </p>

      <footer className="mt-4 border-t border-gray-100/60 pt-3">
        <Link
          href={item.productHref}
          className={cn(styles.productLink, "flex items-center gap-3")}
          aria-label={`View ${item.productName}`}
          data-testid="testimonial-product-link"
        >
          <div className={cn(styles.productThumb, "relative h-8 w-8 shrink-0 overflow-hidden sm:h-10 sm:w-10")}>
            <MithronCardImage
              src={item.productImageUrl}
              alt={item.productImageAlt}
              sizes="(max-width: 640px) 32px, 40px"
              className={styles.productImage}
            />
          </div>
          <div className={cn(styles.meta, "min-w-0")}>
            <p className={styles.name}>{item.authorName}</p>
            <p className={styles.productName}>{item.productName}</p>
            <p className={styles.viewProduct}>View product</p>
          </div>
        </Link>
      </footer>
    </article>
  );
}
