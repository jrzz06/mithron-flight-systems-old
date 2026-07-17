export type ProductPageReview = {
  id: string;
  authorName: string;
  title: string;
  body: string;
  rating: number;
  createdAt?: string;
  productSlug?: string;
  productName?: string;
  helpfulCount?: number;
  imageUrls?: string[];
  verifiedPurchase?: boolean;
  source: "customer";
};

export type ProductReviewSummary = {
  averageRating: number;
  totalReviews: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type ProductReviewsPayload = {
  reviews: ProductPageReview[];
  summary: ProductReviewSummary;
};

export type ReviewSort = "recent" | "helpful" | "highest" | "lowest";
