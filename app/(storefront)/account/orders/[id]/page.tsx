import { notFound, redirect } from "next/navigation";
import {
  AccountCard,
  AccountLink,
  AccountSection,
  AccountStatusChip
} from "@/components/account";
import { CustomerAccountOrdersLiveSync } from "@/components/customer/customer-account-orders-live-sync";
import { OrderReviewForm } from "@/components/customer/order-review-form";
import { OrderProgressTracker } from "@/components/customer/order-progress-tracker";
import { customerPaymentStatus, CUSTOMER_ORDER_POLICY } from "@/lib/customer/copy";
import { formatOrderDate, formatOrderReference } from "@/lib/customer/display";
import { formatAddressMultiline } from "@/lib/addresses/format";
import {
  buildCustomerProgressSteps,
  currentCustomerProgressLabel,
  customerOrderSourceLabel,
  resolveCustomerSource
} from "@/lib/orders/lifecycle";
import { canCustomerReviewOrder } from "@/lib/orders/review-eligibility";
import { formatINR } from "@/lib/utils";
import { getCurrentAuthContext } from "@/services/auth";
import { listCustomerReviewsForOrder } from "@/services/customer-order-reviews";
import { getCustomerOrder } from "@/services/customer-orders";
import { getEnquiryById } from "@/services/enquiries";

function formatAddress(address: Record<string, unknown>) {
  return formatAddressMultiline(address);
}

import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";
function estimatedDelivery(order: Record<string, unknown>) {
  const metadata = order.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const value = record.estimated_delivery ?? record.estimated_delivery_date;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect(`/login?next=/account/orders/${id}`);
  const userId = context.userId;

  const detail = await getCustomerOrder(userId, id);
  if (!detail) notFound();

  const reviews = await listCustomerReviewsForOrder(id, userId);

  const { order, items, payment, shippingAddress, billingAddress, billingSameAsShipping } = detail;
  const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata as Record<string, unknown>
    : {};
  const sourceEnquiryId = typeof metadata.source_enquiry_id === "string" ? metadata.source_enquiry_id : "";
  const linkedEnquiry = sourceEnquiryId
    ? await getEnquiryById(sourceEnquiryId).catch(() => null)
    : null;
  const paymentIntentId = typeof payment?.provider_intent_id === "string" ? payment.provider_intent_id : null;
  const orderSource = resolveCustomerSource(order, paymentIntentId);
  const enquiryCreatedAt =
    typeof linkedEnquiry?.created_at === "string" ? linkedEnquiry.created_at : null;
  const progressSteps = buildCustomerProgressSteps(order, paymentIntentId, {
    enquiryCreatedAt
  });
  const progressLabel = currentCustomerProgressLabel(order, paymentIntentId, {
    enquiryCreatedAt
  });
  const paymentLabel = customerPaymentStatus(String(payment?.status ?? order.payment_status ?? "pending"));
  const tracking = parseShipmentTracking(order.shipment_tracking);
  const canReview = canCustomerReviewOrder(order);

  return (
    <>
      <CustomerAccountOrdersLiveSync />
    <AccountCard>
      <AccountLink href="/account/orders">Back to orders</AccountLink>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h2 className="type-section text-[var(--account-ink)]">{formatOrderReference(order)}</h2>
        <AccountStatusChip
          label={progressLabel}
          status={String(order.status ?? "pending")}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--account-ink-muted)]">
        Placed on {formatOrderDate(order.created_at)}
      </p>

      <div className="mt-6">
        <OrderProgressTracker
          steps={progressSteps}
          paymentLabel={paymentLabel}
          tracking={tracking}
          estimatedDelivery={estimatedDelivery(order)}
          orderSource={orderSource}
          sourceLabel={customerOrderSourceLabel(order, paymentIntentId)}
        />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <AccountSection title="Shipping address">
          {shippingAddress ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--account-ink)]">
              {formatAddress(shippingAddress)}
            </p>
          ) : (
            <p className="text-sm text-[var(--account-ink-muted)]">No shipping address on file.</p>
          )}
        </AccountSection>

        <AccountSection title="Billing address">
          {billingAddress ? (
            <>
              {billingSameAsShipping ? (
                <p className="mb-2 text-xs text-[var(--account-ink-muted)]">Same as shipping address</p>
              ) : null}
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--account-ink)]">
                {formatAddress(billingAddress)}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--account-ink-muted)]">No billing address on file.</p>
          )}
        </AccountSection>
      </div>

      {payment ? (
        <AccountSection title="Payment summary" className="mt-6">
          <div className="grid gap-2 text-sm text-[var(--account-ink)] sm:grid-cols-2">
            <p>Amount: {formatINR(Number(payment.amount ?? order.total ?? 0))}</p>
            <p>Status: {paymentLabel}</p>
            <p>Method: {String(payment.provider ?? "—")}</p>
            {payment.verified_at ? <p>Paid on {formatOrderDate(payment.verified_at)}</p> : null}
          </div>
          {typeof order.invoice_url === "string" && order.invoice_url.trim() ? (
            <div className="mt-4">
              <AccountLink href={`/account/orders/${id}/invoice`}>Download invoice</AccountLink>
            </div>
          ) : null}
        </AccountSection>
      ) : null}

      <AccountSection title="Items in this order" className="mt-6">
        <ul className="grid gap-3">
          {items.map((item) => {
            const slug = String(item.product_slug ?? "");
            const review = reviews.find((row) => String(row.product_slug) === slug);
            return (
              <li
                key={String(item.id)}
                className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-4"
              >
                <p className="font-semibold text-[var(--account-ink)]">
                  {String(item.product_name ?? item.product_slug)}
                </p>
                <p className="mt-1 text-sm text-[var(--account-ink-muted)]">
                  Quantity {String(item.quantity ?? 1)} · {formatINR(Number(item.line_total ?? 0))}
                </p>
                <OrderReviewForm
                  orderId={id}
                  productSlug={slug}
                  productName={String(item.product_name ?? slug)}
                  disabled={!canReview}
                  existingStatus={review ? String(review.status ?? "pending") : null}
                />
              </li>
            );
          })}
        </ul>
      </AccountSection>

      <AccountSection title="Cancellation" description={CUSTOMER_ORDER_POLICY.cancellationUnavailable} className="mt-6">
        <p className="text-sm text-[var(--account-ink-muted)]">
          Need help with this order?{" "}
          <AccountLink href="/contact">Contact our team</AccountLink>
        </p>
      </AccountSection>
    </AccountCard>
    </>
  );
}
