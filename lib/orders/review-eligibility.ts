import { resolveEnterpriseStage } from "@/lib/orders/lifecycle";

type OrderLike = Record<string, unknown>;

const REVIEWABLE_STAGES = new Set(["dispatched", "in_transit", "delivered"]);

export function canCustomerReviewOrder(order: OrderLike) {
  return REVIEWABLE_STAGES.has(resolveEnterpriseStage(order));
}

export const REVIEW_UNAVAILABLE_MESSAGE =
  "Reviews are available once your order has been dispatched.";

export type CustomerProductReviewBlockedReason = "not_purchased" | "awaiting_dispatch" | null;

export type WritableReviewOrder = {
  orderId: string;
  orderNumber: string;
  productSlug: string;
  productName: string;
};

export type OwnProductReviewSummary = {
  id: string;
  orderId: string;
  productSlug: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

export type CustomerProductReviewContext = {
  ownReviews: OwnProductReviewSummary[];
  writableOrders: WritableReviewOrder[];
  blockedReason: CustomerProductReviewBlockedReason;
};