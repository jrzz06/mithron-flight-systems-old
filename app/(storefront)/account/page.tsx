import { redirect } from "next/navigation";
import {
  AccountCard,
  AccountDataUnavailable,
  AccountEmptyState,
  AccountLink,
  AccountListItem,
  AccountPage as AccountPageShell,
  AccountQuickActions,
  AccountSection,
  AccountStat,
  AccountStatusChip
} from "@/components/account";
import { createClient } from "@/lib/server";
import { CUSTOMER_EMPTY_MESSAGES, customerEnquiryStatus, customerFulfillmentStatus, customerOrderStatus } from "@/lib/customer/copy";
import { formatItemCount, formatOrderDate, formatOrderReference, orderItemCount } from "@/lib/customer/display";
import { formatEnquiryReference, listOwnEnquiries } from "@/services/enquiries";
import { listCustomerAddresses } from "@/services/customer-address-actions";
import { listCustomerOrders } from "@/services/customer-orders";
import { getCurrentAuthContext } from "@/services/auth";
import { formatINR } from "@/lib/utils";

async function getProfileDisplayName(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return typeof data?.display_name === "string" ? data.display_name.trim() : "";
}

async function listRecentNotifications(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("notifications")
    .select("id,title,body,status,created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  return data ?? [];
}

export default async function AccountPage() {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account");

  const userId = context.userId;
  const email = context.email ?? "";
  const supabase = await createClient();

  const [profileName, ordersResult, enquiriesResult, addresses, notifications] = await Promise.all([
    getProfileDisplayName(supabase, userId),
    listCustomerOrders(userId),
    listOwnEnquiries(userId),
    listCustomerAddresses(supabase),
    listRecentNotifications(supabase, userId)
  ]);

  const customerName = profileName || context.claimsDisplayName || "there";

  const orders = ordersResult.ok ? ordersResult.data : [];
  const enquiries = enquiriesResult.ok ? enquiriesResult.data : [];
  const dataUnavailable = !ordersResult.ok || !enquiriesResult.ok;

  const recentOrder = orders[0] ?? null;
  const recentEnquiry = enquiries[0] ?? null;

  return (
    <AccountPageShell>
      <AccountCard>
        <p className="text-sm text-[var(--account-ink-muted)]">Welcome back</p>
        <h2 className="type-section mt-2 text-[var(--account-ink)]">{customerName}</h2>
        {email ? <p className="mt-1 text-sm text-[var(--account-ink-muted)]">{email}</p> : null}
        <div className="mt-6">
          <AccountQuickActions
            actions={[
              { label: "Shop products", href: "/products", variant: "default" },
              { label: "Track an order", href: "/track-order" },
              { label: "Contact sales", href: "/contact" }
            ]}
          />
        </div>
      </AccountCard>

      {dataUnavailable ? (
        <AccountDataUnavailable title="Some account data could not be loaded right now." />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <AccountStat label="Orders" value={orders.length} href="/account/orders" />
        <AccountStat label="Enquiries" value={enquiries.length} href="/account/enquiries" />
        <AccountStat label="Saved addresses" value={addresses.length} href="/account/addresses" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AccountSection
          title="Recent order"
          action={<AccountLink href="/account/orders">View all orders</AccountLink>}
        >
          {recentOrder ? (
            <AccountListItem
              href={`/account/orders/${recentOrder.id}`}
              title={formatOrderReference(recentOrder)}
              subtitle={formatOrderDate(recentOrder.created_at)}
              meta={
                <>
                  <p>{formatINR(Number(recentOrder.total ?? 0))}</p>
                  {formatItemCount(orderItemCount(recentOrder)) ? (
                    <p className="mt-1">{formatItemCount(orderItemCount(recentOrder))}</p>
                  ) : null}
                </>
              }
              badges={
                <>
                  <AccountStatusChip
                    label={customerOrderStatus(String(recentOrder.status ?? "pending"))}
                    status={String(recentOrder.status ?? "pending")}
                  />
                  <AccountStatusChip
                    label={customerFulfillmentStatus(String(recentOrder.fulfillment_status ?? "pending"))}
                    status={String(recentOrder.fulfillment_status ?? "pending")}
                  />
                </>
              }
            />
          ) : (
            <AccountEmptyState>
              {CUSTOMER_EMPTY_MESSAGES.orders}{" "}
              <AccountLink href="/products">Start shopping</AccountLink>
            </AccountEmptyState>
          )}
        </AccountSection>

        <AccountSection
          title="Recent enquiry"
          action={<AccountLink href="/account/enquiries">View all enquiries</AccountLink>}
        >
          {recentEnquiry ? (
            <AccountListItem
              href={`/account/enquiries/${recentEnquiry.id}`}
              title={
                typeof recentEnquiry.enquiry_number === "number" && recentEnquiry.enquiry_number > 0
                  ? formatEnquiryReference(recentEnquiry.enquiry_number)
                  : String(recentEnquiry.subject ?? "Enquiry")
              }
              subtitle={String(recentEnquiry.subject ?? "").slice(0, 100)}
              meta={<p>Submitted {formatOrderDate(recentEnquiry.created_at)}</p>}
              badges={
                <AccountStatusChip
                  label={customerEnquiryStatus(String(recentEnquiry.status ?? "new"))}
                  status={String(recentEnquiry.status ?? "new")}
                />
              }
              actionLabel="View enquiry"
            />
          ) : (
            <AccountEmptyState>
              {CUSTOMER_EMPTY_MESSAGES.enquiries}{" "}
              <AccountLink href="/contact">Get in touch</AccountLink>
            </AccountEmptyState>
          )}
        </AccountSection>
      </div>

      <AccountSection title="Notifications">
        {notifications.length ? (
          <ul className="grid gap-3">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-4"
              >
                <p className="font-medium text-[var(--account-ink)]">{notification.title}</p>
                {notification.body ? (
                  <p className="mt-1 text-sm text-[var(--account-ink-muted)]">{notification.body}</p>
                ) : null}
                <p className="mt-2 text-xs text-[var(--account-ink-muted)]">
                  {formatOrderDate(notification.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <AccountEmptyState>{CUSTOMER_EMPTY_MESSAGES.notifications}</AccountEmptyState>
        )}
      </AccountSection>
    </AccountPageShell>
  );
}
