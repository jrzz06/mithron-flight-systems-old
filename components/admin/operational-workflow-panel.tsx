"use client";

import Link from "next/link";
import {
  OperationalDangerAction,
  OperationalNoteField,
  OperationalPrimaryAction,
  OperationalSecondaryAction
} from "@/components/admin/operational-action-panel";
import type { LinkedOrderSummary } from "@/lib/admin/linked-orders";
import { isWarehouseEligible } from "@/lib/orders/lifecycle";

type WorkflowAction = {
  key: string;
  label: string;
  action: (formData: FormData) => Promise<void>;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  description?: string;
  notePlaceholder?: string;
  hiddenFields?: Record<string, string>;
};

export function OperationalWorkflowPanel({
  title = "Workflow actions",
  actions,
  linkedOrder,
  defaultWarehouseCode,
  assignWarehouseAction,
  returnPath
}: {
  title?: string;
  actions: WorkflowAction[];
  linkedOrder?: LinkedOrderSummary | null;
  defaultWarehouseCode?: string;
  assignWarehouseAction?: (formData: FormData) => Promise<void>;
  returnPath?: string;
}) {
  const warehouseEligible = linkedOrder ? isWarehouseEligible(linkedOrder) : false;
  const warehouseCode =
    (linkedOrder?.metadata?.assigned_warehouse_code as string | undefined)?.trim()
    || defaultWarehouseCode
    || "";

  return (
    <section
      className="grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
      data-workflow-actions
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
        {title}
      </p>

      {actions.map((workflowAction) => {
        if (workflowAction.variant === "danger") {
          return (
            <OperationalDangerAction
              key={workflowAction.key}
              action={workflowAction.action}
              buttonLabel={workflowAction.label}
              pendingLabel={workflowAction.pendingLabel}
            >
              {Object.entries(workflowAction.hiddenFields ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <OperationalNoteField placeholder={workflowAction.notePlaceholder ?? "Note (optional)"} />
            </OperationalDangerAction>
          );
        }

        if (workflowAction.variant === "primary") {
          return (
            <OperationalPrimaryAction
              key={workflowAction.key}
              description={workflowAction.description}
              action={workflowAction.action}
              buttonLabel={workflowAction.label}
              pendingLabel={workflowAction.pendingLabel}
            >
              {Object.entries(workflowAction.hiddenFields ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {workflowAction.notePlaceholder ? (
                <OperationalNoteField placeholder={workflowAction.notePlaceholder} />
              ) : null}
            </OperationalPrimaryAction>
          );
        }

        return (
          <OperationalSecondaryAction
            key={workflowAction.key}
            action={workflowAction.action}
            buttonLabel={workflowAction.label}
            pendingLabel={workflowAction.pendingLabel}
          >
            {Object.entries(workflowAction.hiddenFields ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {workflowAction.notePlaceholder ? (
              <OperationalNoteField placeholder={workflowAction.notePlaceholder} />
            ) : null}
          </OperationalSecondaryAction>
        );
      })}

      {linkedOrder ? (
        <div className="grid gap-2 border-t border-[var(--platform-border)] pt-3">
          <p className="text-xs text-[var(--platform-text-muted)]">
            Linked order {linkedOrder.order_number || linkedOrder.id}
          </p>
          <Link
            href={`/admin/orders?order=${encodeURIComponent(linkedOrder.order_number || linkedOrder.id)}&queue=review`}
            className="text-sm font-medium text-[var(--platform-accent)]"
          >
            View linked order
          </Link>
          {warehouseEligible && assignWarehouseAction && warehouseCode ? (
            <OperationalSecondaryAction
              action={assignWarehouseAction}
              buttonLabel="Assign to warehouse"
              pendingLabel="Assigning..."
            >
              <input type="hidden" name="order_id" value={linkedOrder.id} />
              <input type="hidden" name="warehouse_code" value={warehouseCode} />
              <input type="hidden" name="expected_updated_at" value={linkedOrder.updated_at ?? ""} />
              <input type="hidden" name="queue" value="review" />
              {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}
            </OperationalSecondaryAction>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
