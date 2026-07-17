export const ORDER_CONFLICT_FEEDBACK_HINT =
  "The latest order state was synced automatically.";

export function isLegacyOrderConflictFeedback(orderStatus: string, orderMessage: string) {
  return orderStatus === "error" && /Concurrent order update detected/i.test(orderMessage);
}
