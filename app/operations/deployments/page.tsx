import { ControlShell } from "@/components/admin/control-shell";
import { DataList, OperationalFeedback, StatusBadge } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { getOperationsSnapshot } from "@/services/admin";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { createDeploymentRequestFormAction, updateDeploymentRequestStatusFormAction } from "../actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(status: "success" | "error", message: string) {
  return `/operations/deployments?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The deployment request action failed.";
}

async function createDeploymentRequestWithFeedback(formData: FormData) {
  "use server";
  try {
    await createDeploymentRequestFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Deployment request persisted and operations activity refreshed."));
}

async function updateDeploymentRequestWithFeedback(formData: FormData) {
  "use server";
  try {
    await updateDeploymentRequestStatusFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Deployment request status persisted with revision history."));
}

export default async function DeploymentRequestsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const snapshot = await getOperationsSnapshot();
  const params = searchParams ? await searchParams : {};
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");
  const requestStates = ["pending", "approved", "rejected", "deployed", "rolled_back", "triaged", "scheduled", "blocked", "escalated", "completed", "cancelled"];
  const requestCounts = requestStates.map((state) => ({
    state,
    count: snapshot.data.requests.filter((request) => String(request.status ?? "pending") === state).length
  }));
  const deploymentStatusCards = ["pending", "approved", "rejected", "deployed", "rolled_back"].map((state) => ({
    state,
    count: snapshot.data.requests.filter((request) => String(request.status ?? "pending") === state).length
  }));
  const requestRows = snapshot.data.requests.slice(0, 12).map((request) => ({
    label: String(request.requester_email ?? request.id ?? "request"),
    value: String(request.status ?? "pending"),
    detail: `${String(request.region ?? "region")} | ${String(request.mission_profile ?? "mission")} | assigned ${String(request.assigned_to ?? "unassigned")} | updated ${String(request.updated_at ?? "n/a")}`
  }));
  const requestActivityRows = snapshot.data.activity.filter((activity) => String(activity.entity_table ?? "") === "deployment_requests").slice(0, 8).map((activity) => ({
    label: String(activity.action ?? "deployment activity"),
    value: String(activity.severity ?? "info"),
    detail: `${String(activity.entity_id ?? "n/a")} | ${String(activity.created_at ?? "no timestamp")}`
  }));

  return (
    <div data-operations-deployments-route>
      <ControlShell
      scope="operations"
      eyebrow="Deployment requests"
      title="Field intake."
      description={snapshot.blockedReason ?? "Deployment requests store region, mission profile, requester, assignment, notes, and payload state for admin follow-up."}
      metrics={[
        { label: "Requests", value: String(snapshot.data.requests.length) },
        { label: "Tasks", value: String(snapshot.data.tasks.length) },
        { label: "Status", value: snapshot.status }
      ]}
      actions={[
        { label: "Operations", href: "/operations" },
        { label: "Deployments", href: "/operations/deployments" },
        { label: "Tasks", href: "/operations/tasks" },
        { label: "Notifications", href: "/operations/notifications" }
      ]}
      >
      <div className="grid gap-8">
        <div data-operations-request-feedback>
          <OperationalFeedback
            status={operationStatus}
            message={operationMessage}
            context="Deployment request"
            idle="Request create/update results and validation errors appear here."
          />
        </div>

        <section data-deployment-command-workflow className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Deployment command workflow</p>
          <div className="grid gap-2 md:grid-cols-5">
            <div data-deployment-status-pending className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="pending" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{deploymentStatusCards.find((entry) => entry.state === "pending")?.count ?? 0}</p>
            </div>
            <div data-deployment-status-approved className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="approved" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{deploymentStatusCards.find((entry) => entry.state === "approved")?.count ?? 0}</p>
            </div>
            <div data-deployment-status-rejected className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="rejected" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{deploymentStatusCards.find((entry) => entry.state === "rejected")?.count ?? 0}</p>
            </div>
            <div data-deployment-status-deployed className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="deployed" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{deploymentStatusCards.find((entry) => entry.state === "deployed")?.count ?? 0}</p>
            </div>
            <div data-deployment-status-rolled-back className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="rolled_back" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{deploymentStatusCards.find((entry) => entry.state === "rolled_back")?.count ?? 0}</p>
            </div>
          </div>
        </section>

        <section data-request-lifecycle-indicators className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Request lifecycle</p>
          <div className="grid gap-2 md:grid-cols-4">
            {requestCounts.map((entry) => (
              <div key={entry.state} className="rounded-xl border border-white/10 bg-black/18 p-3">
                <StatusBadge status={entry.state} />
                <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{entry.count}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Deployment requests</p>
          <DataList rows={requestRows.length ? requestRows : [{ label: "deployment_requests", value: "0", detail: "No deployment request rows yet." }]} />
        </section>

        <section data-deployment-audit-visibility className="grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Deployment audit visibility</p>
          <DataList rows={requestActivityRows.length ? requestActivityRows : [{ label: "deployment activity", value: "0", detail: "No deployment request activity rows yet." }]} />
        </section>

        <TimedActionForm action={createDeploymentRequestWithFeedback} actionLabel="Create deployment request" data-deployment-requests-table="deployment_requests" className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Requester email</span>
              <input name="requester_email" defaultValue="" placeholder="ops@example.com" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Region</span>
              <input name="region" defaultValue="" placeholder="IN-WEST" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Mission profile</span>
              <input name="mission_profile" defaultValue="" placeholder="agriculture" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
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
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Order ID</span>
              <input name="order_id" defaultValue="" placeholder="optional order uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Assigned to</span>
              <input name="assigned_to" defaultValue="" placeholder="optional user uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Notes</span>
            <input name="notes" defaultValue="" placeholder="Field deployment" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Payload details</span>
            <textarea name="payload" defaultValue="{}" rows={4} className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 font-mono text-xs text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Create deployment request" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
          </label>
          <OperationalSubmitButton pendingLabel="Creating request">
            Create request
          </OperationalSubmitButton>
        </TimedActionForm>

        <TimedActionForm action={updateDeploymentRequestWithFeedback} actionLabel="Update deployment request" data-deployment-approval-actions data-deployment-request-lifecycle-form className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Request ID</span>
              <input name="request_id" defaultValue="" placeholder="uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Status</span>
              <select name="status" defaultValue="approved" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none">
                <option value="pending">pending</option>
                <option value="triaged">triaged</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="scheduled">scheduled</option>
                <option value="deployed">deployed</option>
                <option value="rolled_back">rolled_back</option>
                <option value="blocked">blocked</option>
                <option value="escalated">escalated</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Assigned approver / operator</span>
              <input name="assigned_to" defaultValue="" placeholder="optional user uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Note</span>
              <input name="note" defaultValue="" placeholder="Approved for field dispatch" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Approval details</span>
            <textarea name="payload" defaultValue="{}" rows={4} className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 font-mono text-xs text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-white/70">Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Update deployment request status" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
          </label>
          <OperationalSubmitButton pendingLabel="Updating request">
            Update request
          </OperationalSubmitButton>
        </TimedActionForm>
      </div>
      </ControlShell>
    </div>
  );
}
