import { ControlShell } from "@/components/admin/control-shell";
import { DataList, OperationalFeedback, StatusBadge } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { getOperationsSnapshot } from "@/services/admin";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { createOperationsNotificationFormAction } from "../actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(status: "success" | "error" | "warning", message: string) {
  return `/operations/notifications?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The operations notification action failed.";
}

function asText(value: unknown, fallback = "n/a") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function notificationHref(notification: Record<string, unknown>) {
  const table = asText(notification.entity_table, "");
  const id = asText(notification.entity_id, "");
  if (table === "orders") return `/operations/orders?q=${encodeURIComponent(id)}`;
  if (table === "deployment_requests") return "/operations/deployments";
  if (table === "staff_tasks") return "/operations/tasks";
  return "/operations/notifications";
}

async function createOperationsNotificationWithFeedback(formData: FormData) {
  "use server";
  try {
    await createOperationsNotificationFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Notification persisted or safely deduplicated."));
}

export default async function OperationsNotificationsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const snapshot = await getOperationsSnapshot();
  const params = searchParams ? await searchParams : {};
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");
  const unread = snapshot.data.notifications.filter((notification) => asText(notification.status, "unread") === "unread");
  const read = snapshot.data.notifications.filter((notification) => asText(notification.status, "unread") === "read");
  const critical = snapshot.data.notifications.filter((notification) => /high|critical/.test(asText(notification.priority, "normal")));
  const categoryRows = ["orders", "shipments", "deployment_requests", "staff_tasks"].map((table) => ({
    label: table,
    value: String(snapshot.data.notifications.filter((notification) => asText(notification.entity_table, "") === table).length),
    detail: "Notification event category volume"
  }));
  const notificationRows = snapshot.data.notifications.slice(0, 14).map((notification) => ({
    label: asText(notification.title, asText(notification.id, "notification")),
    value: asText(notification.status, "unread"),
    detail: `${asText(notification.priority, "normal")} | ${asText(notification.entity_table, "operations")}:${asText(notification.entity_id)} | ${asText(notification.created_at, "no timestamp")}`
  }));

  return (
    <ControlShell
      scope="operations"
      eyebrow="Operations notifications"
      title="Live event queue."
      description={snapshot.blockedReason ?? "Operations notifications collect fulfillment, shipment, deployment, task, and alert events with read state and related entity context."}
      metrics={[
        { label: "Unread", value: String(unread.length) },
        { label: "Read", value: String(read.length) },
        { label: "Critical", value: String(critical.length) }
      ]}
      actions={[
        { label: "Operations", href: "/operations" },
        { label: "Orders", href: "/operations/orders" },
        { label: "Deployments", href: "/operations/deployments" },
        { label: "Notifications", href: "/operations/notifications" },
        { label: "Tasks", href: "/operations/tasks" }
      ]}
    >
      <div className="grid gap-8">
        <OperationalFeedback
          status={operationStatus}
          message={operationMessage}
          context="Operations notification"
          idle="Notification create, dedupe, and validation results appear here."
        />

        <section data-operations-notification-route data-operations-notification-center className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="type-meta font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Notification state</p>
          <div className="grid gap-2 md:grid-cols-3">
            <div data-notification-unread-state className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="unread" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{unread.length}</p>
            </div>
            <div data-notification-read-state className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="read" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{read.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status={critical.length ? "warning" : "verified"} />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{critical.length}</p>
            </div>
          </div>
        </section>

        <section data-notification-event-categories className="grid gap-3">
          <p className="type-meta font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Event categories</p>
          <DataList rows={categoryRows} />
        </section>

        <section data-notification-related-links className="grid gap-3">
          <p className="type-meta font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Notification feed</p>
          <div className="grid gap-2">
            {snapshot.data.notifications.slice(0, 10).map((notification) => (
              <Link
                key={asText(notification.id, `${asText(notification.title)}-${asText(notification.created_at)}`)}
                href={notificationHref(notification)}
                className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-[#7ce7c9]/30 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-white/82">{asText(notification.title, "notification")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/42">{asText(notification.entity_table, "operations")} | {asText(notification.entity_id)} | {asText(notification.created_at, "no timestamp")}</p>
                </div>
                <StatusBadge status={asText(notification.status, "unread")} />
              </Link>
            ))}
            {!snapshot.data.notifications.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/50">No notifications available.</div>
            ) : null}
          </div>
        </section>

        <DataList rows={notificationRows.length ? notificationRows : [{ label: "notifications", value: "0", detail: "No notification rows available." }]} />

        <TimedActionForm action={createOperationsNotificationWithFeedback} actionLabel="Create notification" data-operations-notification-actions data-notifications-table="notifications" className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Title</span>
              <input name="title" defaultValue="" placeholder="Deployment alert" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Priority</span>
              <select name="priority" defaultValue="normal" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none">
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Body</span>
            <input name="body" defaultValue="" placeholder="Describe the operational event" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Entity table</span>
              <input name="entity_table" defaultValue="deployment_requests" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Entity ID</span>
              <input name="entity_id" defaultValue="" placeholder="related uuid or reference" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Delivery details</span>
            <textarea name="payload" defaultValue="{}" rows={4} className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 font-mono text-xs text-white outline-none" />
          </label>
          <OperationalSubmitButton pendingLabel="Creating notification">
            Create notification
          </OperationalSubmitButton>
        </TimedActionForm>
      </div>
    </ControlShell>
  );
}
