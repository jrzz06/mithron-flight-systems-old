import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AccountCard,
  AccountLink,
  AccountSection,
  AccountStatusChip
} from "@/components/account";
import { OrderProgressTracker } from "@/components/customer/order-progress-tracker";
import { customerEnquiryStatus, customerPaymentStatus } from "@/lib/customer/copy";
import { formatOrderDate, formatOrderReference } from "@/lib/customer/display";
import {
  buildCustomerProgressSteps,
  customerOrderSourceLabel,
  resolveCustomerSource
} from "@/lib/orders/lifecycle";
import {
  enquiryCartLines,
  enquiryMessageText,
  enquiryProductLabel,
  formatEnquiryReference,
  type AdminEnquiryRow
} from "@/lib/enquiries/shared";
import { getCurrentAuthContext } from "@/services/auth";
import { getOwnEnquiryById } from "@/services/enquiries";
import { getCustomerOrder } from "@/services/customer-orders";

import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";
export default async function AccountEnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect(`/login?next=/account/enquiries/${encodeURIComponent(id)}`);
  const userId = context.userId;

  const enquiry = await getOwnEnquiryById(userId, id);
  if (!enquiry) notFound();

  const enquiryNumber = typeof enquiry.enquiry_number === "number" ? enquiry.enquiry_number : Number(enquiry.enquiry_number);
  const reference = Number.isFinite(enquiryNumber) && enquiryNumber > 0
    ? formatEnquiryReference(enquiryNumber)
    : String(enquiry.subject ?? "Enquiry");
  const convertedOrderId = String(enquiry.converted_order_id ?? "");
  const cartLines = enquiryCartLines(enquiry as AdminEnquiryRow);
  const message = enquiryMessageText(enquiry as AdminEnquiryRow);
  const payload = enquiry.payload && typeof enquiry.payload === "object" && !Array.isArray(enquiry.payload)
    ? enquiry.payload as Record<string, unknown>
    : {};
  const payloadOrderNumber = typeof payload.order_number === "string" ? payload.order_number : "";

  let convertedOrderReference = payloadOrderNumber;
  let orderDetail = null;
  if (convertedOrderId) {
    orderDetail = await getCustomerOrder(userId, convertedOrderId).catch(() => null);
    if (orderDetail?.order && !convertedOrderReference) {
      convertedOrderReference = formatOrderReference(orderDetail.order);
    }
  }

  const isConverted = Boolean(convertedOrderId) || String(enquiry.status ?? "").toLowerCase() === "converted";
  const order = orderDetail?.order ?? null;
  const paymentIntentId = typeof orderDetail?.payment?.provider_intent_id === "string"
    ? orderDetail.payment.provider_intent_id
    : null;
  const progressSteps = order
    ? buildCustomerProgressSteps(order, paymentIntentId, { enquiryCreatedAt: enquiry.created_at })
    : [];
  const orderSource = order ? resolveCustomerSource(order, paymentIntentId) : "enquiry";
  const paymentLabel = order
    ? customerPaymentStatus(String(orderDetail?.payment?.status ?? order.payment_status ?? "pending"))
    : "Pending Payment";
  const tracking = order ? parseShipmentTracking(order.shipment_tracking) : null;

  return (
    <AccountCard>
      <AccountLink href="/account/enquiries">Back to enquiries</AccountLink>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-section text-[var(--account-ink)]">{reference}</h2>
        <AccountStatusChip
          label={customerEnquiryStatus(String(enquiry.status ?? "new"))}
          status={String(enquiry.status ?? "new")}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--account-ink-muted)]">{String(enquiry.subject)}</p>
      <p className="mt-1 text-sm text-[var(--account-ink-muted)]">
        Product: {enquiryProductLabel(enquiry as AdminEnquiryRow)}
      </p>
      <p className="mt-1 text-sm text-[var(--account-ink-muted)]">
        Submitted {formatOrderDate(enquiry.created_at)}
        {enquiry.updated_at ? ` · Last updated ${formatOrderDate(enquiry.updated_at)}` : ""}
      </p>

      {isConverted ? (
        <div className="mt-6 rounded-2xl border border-[color-mix(in_srgb,var(--account-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--account-success)_8%,white)] p-4">
          <p className="font-medium text-[var(--account-ink)]">Successfully converted into an order.</p>
          {convertedOrderReference ? (
            <p className="mt-1 text-sm text-[var(--account-ink-muted)]">Order number: {convertedOrderReference}</p>
          ) : null}
          {convertedOrderId ? (
            <Button asChild className="mt-4" size="sm">
              <Link href={`/account/orders/${encodeURIComponent(convertedOrderId)}`}>View order</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {order && progressSteps.length ? (
        <div className="mt-6">
          <OrderProgressTracker
            steps={progressSteps}
            paymentLabel={paymentLabel}
            tracking={tracking}
            orderSource={orderSource}
            sourceLabel={customerOrderSourceLabel(order, paymentIntentId)}
          />
        </div>
      ) : null}

      {cartLines.length ? (
        <AccountSection title="Requested products" className="mt-6">
          <ul className="grid gap-2">
            {cartLines.map((line) => (
              <li
                key={`${line.product_slug}-${line.product_name}`}
                className="flex items-center justify-between rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] px-4 py-3 text-sm"
              >
                <span className="text-[var(--account-ink)]">{line.product_name}</span>
                <span className="text-[var(--account-ink-muted)]">Qty {line.quantity}</span>
              </li>
            ))}
          </ul>
        </AccountSection>
      ) : null}

      <AccountSection title="Your message" className="mt-6">
        <p className="whitespace-pre-wrap rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] px-4 py-3 text-sm leading-relaxed text-[var(--account-ink)]">
          {message || "—"}
        </p>
      </AccountSection>
    </AccountCard>
  );
}
