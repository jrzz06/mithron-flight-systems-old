import { ControlShell } from "@/components/admin/control-shell";
import { AdminFormSection, AdminStickyActionFooter, DataList, OperationalFeedback, StatusBadge } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { getOperationsSnapshot } from "@/services/admin";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { createStaffTaskFormAction, updateStaffTaskStatusFormAction } from "../actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(status: "success" | "error", message: string) {
  return `/operations/tasks?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The staff task action failed.";
}

async function createStaffTaskWithFeedback(formData: FormData) {
  "use server";
  try {
    await createStaffTaskFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Staff task persisted and activity history refreshed."));
}

async function updateStaffTaskWithFeedback(formData: FormData) {
  "use server";
  try {
    await updateStaffTaskStatusFormAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", messageFromError(error)));
  }
  redirect(feedbackPath("success", "Staff task status persisted."));
}

export default async function StaffTasksPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const snapshot = await getOperationsSnapshot();
  const params = searchParams ? await searchParams : {};
  const operationStatus = searchValue(params, "operation_status");
  const operationMessage = searchValue(params, "operation_message");
  const pendingTasks = snapshot.data.tasks.filter((task) => String(task.status ?? "open") === "open");
  const inProgressTasks = snapshot.data.tasks.filter((task) => String(task.status ?? "open") === "in_progress");
  const completedTasks = snapshot.data.tasks.filter((task) => String(task.status ?? "open") === "done");
  const overdueTasks = snapshot.data.tasks.filter((task) => {
    const status = String(task.status ?? "open");
    const priority = String(task.priority ?? "normal");
    return status === "blocked" || (priority === "critical" && status !== "done");
  });
  const priorityRows = ["critical", "high", "normal", "low"].map((priority) => ({
    label: priority,
    value: String(snapshot.data.tasks.filter((task) => String(task.priority ?? "normal") === priority).length),
    detail: "Task priority distribution"
  }));
  const taskRows = snapshot.data.tasks.slice(0, 12).map((task) => ({
    label: String(task.title ?? task.id ?? "task"),
    value: String(task.status ?? "open"),
    detail: `${String(task.priority ?? "normal")} | assigned ${String(task.assigned_to ?? "unassigned")} | due ${String(task.due_at ?? "n/a")} | updated ${String(task.updated_at ?? "n/a")}`
  }));

  return (
    <div data-operations-tasks-route>
      <ControlShell
      scope="operations"
      eyebrow="Task board"
      title="Assigned deployment work."
      description={snapshot.blockedReason ?? "Admin-only task surface for assigned work, deployment request monitoring, and follow-up actions."}
      metrics={[
        { label: "Tasks", value: String(snapshot.data.tasks.length) },
        { label: "Requests", value: String(snapshot.data.requests.length) },
        { label: "Status", value: snapshot.status }
      ]}
      actions={[
        { label: "Operations", href: "/operations" },
        { label: "Deployments", href: "/operations/deployments" },
        { label: "Notifications", href: "/operations/notifications" }
      ]}
      >
      <div className="grid gap-8">
        <div data-operations-task-feedback>
          <OperationalFeedback
            status={operationStatus}
            message={operationMessage}
            context="Staff task"
            idle="Task create/update results and retry guidance appear here."
          />
        </div>

        <section data-task-dashboard data-task-lifecycle-indicators className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Task lifecycle</p>
          <div className="grid gap-2 md:grid-cols-4">
            <div data-pending-tasks className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="open" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{pendingTasks.length}</p>
              <p className="mt-1 text-xs text-white/42">Pending tasks</p>
            </div>
            <div data-in-progress-tasks className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="in_progress" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{inProgressTasks.length}</p>
              <p className="mt-1 text-xs text-white/42">Active work</p>
            </div>
            <div data-completed-tasks className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status="done" />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{completedTasks.length}</p>
              <p className="mt-1 text-xs text-white/42">Completed tasks</p>
            </div>
            <div data-overdue-tasks className="rounded-xl border border-white/10 bg-black/18 p-3">
              <StatusBadge status={overdueTasks.length ? "warning" : "verified"} />
              <p className="mt-3 font-[var(--type-display)] text-2xl font-semibold text-white">{overdueTasks.length}</p>
              <p className="mt-1 text-xs text-white/42">Blocked or critical aging</p>
            </div>
          </div>
        </section>

        <section data-task-priority-indicators className="grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Priority indicators</p>
          <DataList rows={priorityRows} />
        </section>

        <section data-task-metadata-grid className="grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ce7c9]">Staff tasks</p>
          <DataList rows={taskRows.length ? taskRows : [{ label: "staff_tasks", value: "0", detail: "No staff task rows yet." }]} />
        </section>

        <AdminFormSection title="Task actions" description="Create, update, complete, or reopen staff work with feedback on each mutation.">
        <div data-task-action-controls className="grid gap-5">
          <TimedActionForm id="create-task" action={createStaffTaskWithFeedback} actionLabel="Create staff task" data-staff-tasks-table="staff_tasks" className="scroll-mt-24 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Title</span>
              <input name="title" defaultValue="" placeholder="Approve field kit" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
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
              <span className="text-white/70">Assigned to</span>
              <input name="assigned_to" defaultValue="" placeholder="optional user uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Related request ID</span>
              <input name="related_request_id" defaultValue="" placeholder="deployment request uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Due at</span>
              <input name="due_at" defaultValue="" placeholder="2026-05-25T10:00:00.000Z" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Status</span>
              <select name="status" defaultValue="open" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none">
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
            </label>
            </div>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Body</span>
              <input name="body" defaultValue="" placeholder="Confirm stock, pilot, and service window." className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Change summary</span>
              <input name="change_summary" defaultValue="" placeholder="Create staff task" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <AdminStickyActionFooter>
              <OperationalSubmitButton pendingLabel="Creating task">
                Create task
              </OperationalSubmitButton>
            </AdminStickyActionFooter>
          </TimedActionForm>

          <TimedActionForm action={updateStaffTaskWithFeedback} actionLabel="Update staff task" data-staff-task-status-form className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Task ID</span>
              <input name="task_id" defaultValue="" placeholder="uuid" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Status</span>
              <select name="status" defaultValue="in_progress" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none">
                <option data-task-reopen-option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
            </label>
            </div>
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Status note</span>
              <input name="note" defaultValue="" placeholder="Awaiting approval" className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-white outline-none placeholder:text-white/30" />
            </label>
            <AdminStickyActionFooter>
              <OperationalSubmitButton pendingLabel="Updating task">
                Update task
              </OperationalSubmitButton>
            </AdminStickyActionFooter>
          </TimedActionForm>
        </div>
        </AdminFormSection>
      </div>
      </ControlShell>
    </div>
  );
}
