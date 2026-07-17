import Link from "next/link";
import { AdminSection, DataList, OperationalFeedback } from "@/components/admin/module-panel";
import { MetricGrid } from "@/components/platform";
import { FormField, Input, Select, Textarea } from "@/components/platform/form-field";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { connectivityMessage, emptyMessage, humanStatus, relativeTimeLabel } from "@/lib/platform/copy";
import { getOperationsSnapshot } from "@/services/admin";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { createOperationsNotificationFormAction } from "./actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(status: "success" | "error" | "warning", message: string) {
  return `/operations?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The notification could not be created.";
}

function recordStatus(record: Record<string, unknown>, fallback: string) {
  return String(record.status ?? fallback);
}

function recordTimestamp(record: Record<string, unknown>) {
  return String(record.updated_at ?? record.created_at ?? "");
}

function notificationTargetHref(notification: Record<string, unknown>) {
  const table = String(notification.entity_table ?? "");
  const id = String(notification.entity_id ?? "");
  if (table === "orders") return `/operations/orders?q=${encodeURIComponent(id)}`;
  if (table === "deployment_requests") return "/operations/deployments";
  if (table === "staff_tasks") return "/operations/tasks";
  if (table === "shipments") return "/operations/orders";
  return "/operations";
}

function categoryLabel(table: string) {
  if (table === "orders") return "Orders";
  if (table === "shipments") return "Shipments";
  if (table === "deployment_requests") return "Field requests";
  if (table === "staff_tasks") return "Tasks";
  return table.replaceAll("_", " ");
}

async function createOperationsNotificationWithFeedback(formData: FormData) {
  "use server";
  try {
    await createOperationsNotificationFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Notification sent."));
}

export default async function OperationsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const snapshot = await getOperationsSnapshot();
  const params = searchParams ? await searchParams : {};
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");
  const unreadNotifications = snapshot.data.notifications.filter((notification) => recordStatus(notification, "unread") === "unread");
  const unresolvedAlerts = snapshot.data.notifications.filter((notification) => (
    recordStatus(notification, "unread") === "unread"
    && /high|critical/.test(String(notification.priority ?? "normal"))
  ));
  const pendingOperationsCount = snapshot.data.requests.filter((request) => /pending|triaged/.test(recordStatus(request, "pending"))).length
    + snapshot.data.tasks.filter((task) => recordStatus(task, "open") === "open").length;
  const activeDeploymentsCount = snapshot.data.requests.filter((request) => /approved|scheduled|deployed/.test(recordStatus(request, "pending"))).length;
  const blockedWorkCount = snapshot.data.requests.filter((request) => /blocked|escalated|rejected|rolled_back/.test(recordStatus(request, "pending"))).length
    + snapshot.data.tasks.filter((task) => recordStatus(task, "open") === "blocked").length;

  const notificationCategoryRows = ["orders", "shipments", "deployment_requests", "staff_tasks"].map((table) => ({
    label: categoryLabel(table),
    value: String(snapshot.data.notifications.filter((notification) => String(notification.entity_table ?? "") === table).length),
    detail: "Open notifications"
  }));

  const notificationRows = snapshot.data.notifications.slice(0, 8).map((notification) => ({
    label: String(notification.title ?? "Notification"),
    value: humanStatus(String(notification.status ?? "unread")),
    detail: relativeTimeLabel(String(notification.created_at ?? ""))
  }));

  const timelineRows = [
    ...snapshot.data.activity.map((activity) => ({
      label: String(activity.action ?? "Activity"),
      value: humanStatus(String(activity.severity ?? "info")),
      detail: relativeTimeLabel(recordTimestamp(activity))
    })),
    ...snapshot.data.notifications.slice(0, 4).map((notification) => ({
      label: String(notification.title ?? "Notification"),
      value: humanStatus(String(notification.priority ?? "normal")),
      detail: relativeTimeLabel(recordTimestamp(notification))
    }))
  ].slice(0, 8);

  return (
    <div data-operations-route className="grid gap-5">
      {snapshot.blockedReason ? (
        <p className="rounded-[var(--platform-radius)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {connectivityMessage(snapshot.blockedReason)}
        </p>
      ) : null}

      <OperationalFeedback
        status={operationStatus}
        message={operationMessage}
        context="Operations"
        idle="Workflow updates will appear here."
      />

      <section data-operations-command-center>
        <MetricGrid
          metrics={[
            { label: "Open work", value: String(pendingOperationsCount), detail: "Tasks and requests" },
            { label: "Active field work", value: String(activeDeploymentsCount), detail: "In progress" },
            { label: "Needs attention", value: String(unresolvedAlerts.length + blockedWorkCount), detail: "Critical or blocked" },
            { label: "Unread", value: String(unreadNotifications.length), detail: "Notifications" }
          ]}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title="Notifications" description="Latest operational updates.">
          <DataList rows={notificationRows.length ? notificationRows : [{ label: "Notifications", value: "None", detail: emptyMessage("notifications") }]} />
        </AdminSection>
        <AdminSection title="Activity" description="Recent workspace events.">
          <DataList rows={timelineRows.length ? timelineRows : [{ label: "Activity", value: "Quiet", detail: emptyMessage("activity") }]} />
        </AdminSection>
      </div>

      <AdminSection title="By category">
        <DataList rows={notificationCategoryRows} />
      </AdminSection>

      <AdminSection title="Related links">
        <div className="grid gap-2">
          {snapshot.data.notifications.slice(0, 6).map((notification) => (
            <Link
              key={String(notification.id ?? notification.title ?? notification.created_at)}
              href={notificationTargetHref(notification)}
              className="rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)] transition hover:bg-[var(--platform-surface)]"
            >
              {String(notification.title ?? "Notification")}
            </Link>
          ))}
          {!snapshot.data.notifications.length ? <p className="text-sm text-[var(--platform-text-muted)]">{emptyMessage("notifications")}</p> : null}
        </div>
      </AdminSection>

      <AdminSection title="Create notification">
        <TimedActionForm action={createOperationsNotificationWithFeedback} actionLabel="Send notification" data-operations-notification-actions className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Title" htmlFor="ops-title">
              <Input id="ops-title" name="title" placeholder="Deployment escalated" />
            </FormField>
            <FormField label="Channel" htmlFor="ops-channel">
              <Input id="ops-channel" name="channel" defaultValue="operations" />
            </FormField>
            <FormField label="Priority" htmlFor="ops-priority">
              <Select id="ops-priority" name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </FormField>
            <FormField label="Recipient" htmlFor="ops-recipient">
              <Input id="ops-recipient" name="recipient_id" placeholder="Optional user ID" />
            </FormField>
          </div>
          <FormField label="Message" htmlFor="ops-body">
            <Input id="ops-body" name="body" placeholder="Describe what needs attention." />
          </FormField>
          <FormField label="Notes" htmlFor="ops-summary">
            <Textarea id="ops-summary" name="change_summary" rows={2} placeholder="Internal summary" />
          </FormField>
          <input type="hidden" name="entity_table" value="deployment_requests" />
          <input type="hidden" name="entity_id" value="" />
          <input type="hidden" name="payload" value="{}" />
          <OperationalSubmitButton pendingLabel="Sending">Send notification</OperationalSubmitButton>
        </TimedActionForm>
      </AdminSection>
    </div>
  );
}
