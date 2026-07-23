"use client";

import Image from "next/image";
import { ThumbsUp } from "@/components/icons/storefront-icons";
import { useMemo, useState } from "react";
import type { ProductPageReview, ProductReviewSummary, ReviewSort } from "@/lib/product-reviews/types";
import { cn } from "@/lib/utils";
import styles from "./product-discovery.module.css";

function getVoterKey() {
  if (typeof window === "undefined") return "server";
  const key = "mithron-review-voter";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `client:${crypto.randomUUID()}`;
  window.localStorage.setItem(key, next);
  return next;
}

function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn(styles.reviewStarRow, className)} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < rating ? styles.reviewStarFilled : styles.reviewStarEmpty} />
      ))}
    </div>
  );
}

function formatReviewDate(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function sortReviews(reviews: ProductPageReview[], sort: ReviewSort) {
  const next = [...reviews];
  switch (sort) {
    case "helpful":
      return next.sort(
        (left, right) =>
          (right.helpfulCount ?? 0) - (left.helpfulCount ?? 0) ||
          Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "")
      );
    case "highest":
      return next.sort(
        (left, right) =>
          right.rating - left.rating ||
          Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "")
      );
    case "lowest":
      return next.sort(
        (left, right) =>
          left.rating - right.rating ||
          Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "")
      );
    case "recent":
    default:
      return next.sort(
        (left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "")
      );
  }
}

function RatingDistribution({
  summary,
  activeRating,
  onSelectRating
}: {
  summary: ProductReviewSummary;
  activeRating: number | null;
  onSelectRating: (rating: number | null) => void;
}) {
  const maxCount = Math.max(...Object.values(summary.distribution), 1);

  return (
    <div className={styles.reviewDistribution} role="group" aria-label="Filter by rating">
      {([5, 4, 3, 2, 1] as const).map((stars) => {
        const count = summary.distribution[stars];
        const width = `${Math.max(6, Math.round((count / maxCount) * 100))}%`;
        const isActive = activeRating === stars;
        return (
          <button
            key={stars}
            type="button"
            className={cn(styles.reviewDistributionRow, isActive && styles.reviewDistributionRowActive)}
            aria-pressed={isActive}
            aria-label={
              isActive
                ? `Clear ${stars}-star filter`
                : `Show ${stars}-star reviews (${count})`
            }
            onClick={() => onSelectRating(isActive ? null : stars)}
            disabled={count === 0 && !isActive}
          >
            <span className={styles.reviewDistributionLabel}>{stars}</span>
            <div className={styles.reviewDistributionTrack}>
              <span className={styles.reviewDistributionFill} style={{ width }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({
  review,
  productName,
  productSlug
}: {
  review: ProductPageReview;
  productName: string;
  productSlug: string;
}) {
  const [helpfulPressed, setHelpfulPressed] = useState(false);
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount ?? 0);
  const [helpfulError, setHelpfulError] = useState<string | null>(null);
  const reviewDate = formatReviewDate(review.createdAt);
  const displayProductName = review.productName ?? productName;

  async function onHelpful() {
    if (helpfulPressed) return;
    setHelpfulError(null);
    try {
      const response = await fetch(`/api/products/${productSlug}/reviews/${review.id}/helpful`, {
        method: "POST",
        headers: { "x-review-voter": getVoterKey() }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not mark helpful.");
      }
      setHelpfulPressed(true);
      if (typeof payload.helpfulCount === "number") {
        setHelpfulCount(payload.helpfulCount);
      } else {
        setHelpfulCount((count) => count + 1);
      }
    } catch (error) {
      setHelpfulError(error instanceof Error ? error.message : "Could not mark helpful.");
    }
  }

  return (
    <article className={styles.reviewCard}>
      <div className={styles.reviewCardHeader}>
        <StarRow rating={review.rating} />
        <p className={styles.reviewAuthor}>{review.authorName}</p>
      </div>

      <div className={styles.reviewMetaRow}>
        {reviewDate ? <span>{reviewDate}</span> : null}
        {reviewDate ? <span aria-hidden="true">·</span> : null}
        <span>{displayProductName}</span>
        {review.verifiedPurchase ? (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.reviewVerifiedBadge}>Verified purchase</span>
          </>
        ) : null}
      </div>

      {review.title ? <h3 className={styles.reviewItemTitle}>{review.title}</h3> : null}
      <p className={styles.reviewItemBody}>{review.body}</p>

      {review.imageUrls?.length ? (
        <div className={styles.reviewImageGrid}>
          {review.imageUrls.map((url) => (
            <div key={url} className={styles.reviewImageWell}>
              <Image src={url} alt="" fill sizes="120px" className={styles.reviewImage} loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className={cn(styles.reviewHelpfulButton, helpfulPressed && styles.reviewHelpfulButtonPressed)}
        aria-pressed={helpfulPressed}
        onClick={onHelpful}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        <span>Helpful{helpfulCount > 0 ? ` · ${helpfulCount}` : ""}</span>
      </button>
      {helpfulError ? <p className={styles.reviewHelpfulError}>{helpfulError}</p> : null}
    </article>
  );
}

function ReviewsEmptyState() {
  return (
    <div className={styles.reviewsEmptyState}>
      <p className={styles.reviewsEmptyTitle}>No reviews yet</p>
    </div>
  );
}

export function ProductReviewsSection({
  productName,
  productSlug,
  reviews,
  summary
}: {
  productName: string;
  productSlug: string;
  reviews: ProductPageReview[];
  summary: ProductReviewSummary;
}) {
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [query, setQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const sortedReviews = useMemo(() => sortReviews(reviews, sort), [reviews, sort]);
  const filteredReviews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortedReviews.filter((review) => {
      if (ratingFilter != null && review.rating !== ratingFilter) return false;
      if (!normalized) return true;
      const haystack = `${review.title} ${review.body} ${review.authorName}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, ratingFilter, sortedReviews]);

  return (
    <section
      id="reviews"
      className={cn(styles.discoverySection, styles.reviewsSection)}
      aria-labelledby="product-reviews-title"
    >
      <div className={styles.discoveryInner}>
        <div className={styles.reviewsContainer}>
          <h2 id="product-reviews-title" className={styles.reviewsTitle}>
            Customer Reviews
          </h2>

          {!reviews.length ? (
            <ReviewsEmptyState />
          ) : (
            <>
              <div className={styles.reviewsSummaryGrid}>
                <div>
                  <p className={styles.reviewsScoreValue}>{summary.averageRating.toFixed(1)}</p>
                  <StarRow rating={Math.round(summary.averageRating)} className={styles.reviewsScoreStars} />
                  <p className={styles.reviewsScoreMeta}>
                    {summary.totalReviews} review{summary.totalReviews === 1 ? "" : "s"}
                  </p>
                  {ratingFilter != null ? (
                    <button
                      type="button"
                      className={styles.reviewsClearFilter}
                      onClick={() => setRatingFilter(null)}
                    >
                      Showing {ratingFilter}-star · Clear
                    </button>
                  ) : null}
                </div>
                <RatingDistribution
                  summary={summary}
                  activeRating={ratingFilter}
                  onSelectRating={setRatingFilter}
                />
              </div>

              <div className={styles.reviewsToolbar}>
                <p className={styles.reviewsCount}>
                  {filteredReviews.length} of {summary.totalReviews} review{summary.totalReviews === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className={styles.reviewsSortLabel}>
                    <span className="sr-only">Search reviews</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search reviews"
                      className={styles.reviewsControl}
                    />
                  </label>
                  <label className={styles.reviewsSortLabel}>
                    <span className="sr-only">Sort reviews</span>
                    <select
                      className={styles.reviewsControl}
                      value={sort}
                      onChange={(event) => setSort(event.target.value as ReviewSort)}
                    >
                      <option value="recent">Most Recent</option>
                      <option value="helpful">Most Helpful</option>
                      <option value="highest">Highest Rating</option>
                      <option value="lowest">Lowest Rating</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.reviewList}>
                {filteredReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    productName={productName}
                    productSlug={productSlug}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
