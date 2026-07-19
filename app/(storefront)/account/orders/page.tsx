import { redirect } from "next/navigation";
import { CustomerAccountOrdersLiveSync } from "@/components/customer/customer-account-orders-live-sync";
import {
  AccountCard,
  AccountDataUnavailable,
  AccountEmptyState,
  AccountLink,
  AccountListItem,
  AccountPage as AccountPageShell,
  AccountSection,
  AccountStatusChip
} from "@/components/account";
import { CUSTOMER_EMPTY_MESSAGES, CUSTOMER_ORDER_POLICY, customerFulfillmentStatus, customerOrderStatus } from "@/lib/customer/copy";
import { formatItemCount, formatOrderDate, formatOrderReference, orderItemCount } from "@/lib/customer/display";
import { formatINR } from "@/lib/utils";
import { getCurrentAuthContext } from "@/services/auth";
import { listCustomerOrders } from "@/services/customer-orders";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account/orders");

  const ordersResult = await listCustomerOrders(context.userId);

  return (
    <AccountPageShell>
      <CustomerAccountOrdersLiveSync />
      <AccountCard>
        <AccountSection
          title="Your orders"
          description={`Track deliveries and view order details. ${CUSTOMER_ORDER_POLICY.cancellationUnavailable}`}
          action={<AccountLink href="/track-order">Track without signing in</AccountLink>}
        >
          {!ordersResult.ok ? (
            <AccountDataUnavailable title="We could not load your orders right now." />
          ) : ordersResult.data.length ? (
            <ul className="grid gap-3">
              {ordersResult.data.map((order) => (
                <li key={String(order.id)}>
                  <AccountListItem
                    href={`/account/orders/${order.id}`}
                    title={formatOrderReference(order)}
                    subtitle={formatOrderDate(order.created_at)}
                    meta={
                      <div className="space-y-1">
                        <p>{formatINR(Number(order.total ?? 0))}</p>
                        {formatItemCount(orderItemCount(order)) ? (
                          <p>{formatItemCount(orderItemCount(order))}</p>
                        ) : null}
                      </div>
                    }
                    badges={
                      <>
                        <AccountStatusChip
                          label={customerOrderStatus(String(order.status ?? "pending"))}
                          status={String(order.status ?? "pending")}
                        />
                        <AccountStatusChip
                          label={customerFulfillmentStatus(String(order.fulfillment_status ?? "pending"))}
                          status={String(order.fulfillment_status ?? "pending")}
                        />
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <AccountEmptyState>
              {CUSTOMER_EMPTY_MESSAGES.orders}{" "}
              <AccountLink href="/checkout">Place your first order</AccountLink>
            </AccountEmptyState>
          )}
        </AccountSection>
      </AccountCard>
    </AccountPageShell>
  );
}
