"use client";

import { REVIEW_UNAVAILABLE_MESSAGE } from "@/lib/orders/review-eligibility";
import { useState } from "react";
import { AccountField, AccountTextarea } from "@/components/account";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type OrderReviewExisting = {
  id: string;
  rating?: number | null;
  title?: string | null;
  body?: string | null;
  status?: string | null;
};

export function OrderReviewForm({
  orderId,
  productSlug,
  productName,
  disabled,
  existingReview,
  compact,
  onSuccess
}: {
  orderId: string;
  productSlug: string;
  productName: string;
  disabled?: boolean;
  existingReview?: OrderReviewExisting | null;
  /** Tighter spacing for product-page embed */
  compact?: boolean;
  onSuccess?: () => void;
}) {
  const isEdit = Boolean(existingReview?.id);
  const [rating, setRating] = useState(Math.min(5, Math.max(1, Math.round(Number(existingReview?.rating) || 5))));
  const [title, setTitle] = useState(existingReview?.title?.trim() ?? "");
  const [body, setBody] = useState(existingReview?.body?.trim() ?? "");
  const { status, pending, run, setStatus } = useAsyncAction({
    label: isEdit ? "Update review" : "Submit review"
  });
  const [message, setMessage] = useState<string | null>(null);

  if (!orderId || !productSlug) {
    return null;
  }

  if (disabled && !isEdit) {
    return (
      <p
        className={
          compact
            ? "text-sm text-[var(--account-ink-muted)]"
            : "mt-4 border-t border-[var(--account-border)] pt-4 text-sm text-[var(--account-ink-muted)]"
        }
      >
        {REVIEW_UNAVAILABLE_MESSAGE}
      </p>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setMessage(null);

    try {
      const result = await run(async () => {
        const formData = new FormData();
        formData.set("productSlug", productSlug);
        formData.set("productName", productName);
        formData.set("rating", String(rating));
        formData.set("title", title);
        formData.set("body", body);

        let response: Response;
        if (isEdit && existingReview?.id) {
          formData.set("reviewId", existingReview.id);
          response = await fetchWithTimeout("/api/account/reviews", { method: "PATCH", body: formData });
        } else {
          formData.set("orderId", orderId);
          response = await fetchWithTimeout("/api/account/reviews", { method: "POST", body: formData });
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            ok: false as const,
            error: typeof payload.error === "string"
              ? payload.error
              : isEdit
                ? "We couldn't update your review. Please try again."
                : "We couldn't submit your review. Please try again."
          };
        }
        return { ok: true as const };
      });

      if (!result) return;
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setMessage(
        isEdit
          ? `Your review of ${productName} was updated.`
          : `Thank you for reviewing ${productName}. Your review is now live on the product page.`
      );
      onSuccess?.();
    } catch {
      setMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return <p className="text-sm text-[var(--account-accent)]">{message}</p>;
  }

  return (
    <form
      id={compact ? "write-review" : undefined}
      onSubmit={onSubmit}
      className={compact ? "mt-4 grid gap-3" : "mt-4 grid gap-3 border-t border-[var(--account-border)] pt-4"}
    >
      <p className="text-sm font-medium text-[var(--account-ink)]">
        {isEdit ? `Edit review of ${productName}` : `Review ${productName}`}
      </p>
      <AccountField label="Rating">
        <select
          value={rating}
          onChange={(event) => setRating(Number(event.target.value))}
          className="min-h-11 w-28 rounded-xl border border-[var(--account-border-strong)] bg-[var(--account-surface)] px-3 py-2 text-[var(--account-ink)]"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} stars
            </option>
          ))}
        </select>
      </AccountField>
      <AccountField label="Review title">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          className="min-h-11 w-full rounded-xl border border-[var(--account-border-strong)] bg-[var(--account-surface)] px-3 py-2 text-[var(--account-ink)]"
          placeholder="Summarize your experience"
        />
      </AccountField>
      <AccountField label="Your review">
        <AccountTextarea required value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
      </AccountField>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? (isEdit ? "Saving…" : "Submitting…") : isEdit ? "Save changes" : "Submit review"}
      </Button>
      {status === "error" && message ? <p className="text-sm text-[var(--account-danger)]">{message}</p> : null}
    </form>
  );
}
