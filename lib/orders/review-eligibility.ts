import { resolveEnterpriseStage } from "@/lib/orders/lifecycle";

type OrderLike = Record<string, unknown>;

const REVIEWABLE_STAGES = new Set(["dispatched", "in_transit", "delivered"]);

export function canCustomerReviewOrder(order: OrderLike) {
  return REVIEWABLE_STAGES.has(resolveEnterpriseStage(order));
}

export const REVIEW_UNAVAILABLE_MESSAGE =
  "Reviews are available once your order has been dispatched.";
