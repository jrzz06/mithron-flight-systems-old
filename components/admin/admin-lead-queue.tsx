"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";
import { notify } from "@/lib/feedback/notify";
import {
  type AdminLeadRow,
  formatLeadReference,
  isLeadConverted,
  leadSourceBadgeClass,
  leadSourceLabel
} from "@/lib/leads/shared";
import type { LeadActionResult } from "@/app/admin/leads/actions";

type LinkedOrderSummary = {
  id: string;
  order_number?: string | null;
  status?: string | null;
  fulfillment_status?: string | null;
};

type LeadQueueActions = {
  pushToOrder: (formData: FormData) => Promise<LeadActionResult>;
  deleteLead: (formData: FormData) => Promise<LeadActionResult>;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function relativeTimeLabel(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AdminLeadQueue({
  leads,
  linkedOrders,
  listStatus,
  listQuery,
  actions
}: {
  leads: AdminLeadRow[];
  linkedOrders: Record<string, LinkedOrderSummary | null | undefined>;
  listStatus: string;
  listQuery: string;
  actions: LeadQueueActions;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timedPush = useMemo(
    () =>
      wrapServerAction(async (formData: FormData) => {
        const result = await actions.pushToOrder(formData);
        if (result.ok === false) notify.error(result.message);
        else notify.success(result.message);
      }, { label: "Pushing to order" }),
    [actions]
  );

  const timedDelete = useMemo(
    () =>
      wrapServerAction(async (formData: FormData) => {
        const result = await actions.deleteLead(formData);
        if (result.ok === false) notify.error(result.message);
        else notify.success(result.message);
      }, { label: "Deleting lead" }),
    [actions]
  );

  if (!leads.length) {
    return (
      <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-4 py-8 text-center text-sm text-[var(--platform-text-muted)]">
        No leads match this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--platform-border)]">
      <table className="min-w-full text-sm" data-lead-queue>
        <thead className="sticky top-0 z-10 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-left type-meta uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Phone</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Received</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const id = String(lead.id);
            const expanded = expandedId === id;
            const converted = isLeadConverted(lead);
            const linkedOrderId = text(lead.converted_order_id);
            const linkedOrder = linkedOrderId ? linkedOrders[linkedOrderId] ?? null : null;
            const reference = formatLeadReference(lead.lead_number);

            return (
              <Fragment key={id}>
                <tr data-lead-row data-lead-status={text(lead.status, "new")} className="border-b border-[var(--platform-border)]">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-[var(--platform-text-primary)]">{text(lead.name, "—")}</p>
                    <p className="text-xs text-[var(--platform-text-muted)]">{text(lead.email, "—")}</p>
                    <p className="mt-0.5 type-badge uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">{reference}</p>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--platform-text-secondary)] md:table-cell">
                    {text(lead.phone, "—")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-md border px-2 py-0.5 type-badge font-medium uppercase tracking-[0.05em] ${leadSourceBadgeClass(lead.source)}`}>
                      {leadSourceLabel(lead.source)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--platform-text-secondary)]">
                    {text(lead.product_name) || text(lead.product_slug) || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-md border border-[var(--platform-border)] px-2 py-0.5 type-badge font-medium uppercase tracking-[0.05em] text-[var(--platform-text-muted)]">
                      {converted ? "Converted" : "New"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-[var(--platform-text-muted)] xl:table-cell">
                    {relativeTimeLabel(text(lead.created_at))}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {converted && linkedOrderId ? (
                        <Link
                          href={`/admin/orders?order=${encodeURIComponent(text(linkedOrder?.order_number) || linkedOrderId)}`}
                          className="text-xs font-medium text-[var(--platform-accent)]"
                        >
                          View order
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : id)}
                        className="text-xs font-medium text-[var(--platform-accent)]"
                      >
                        {expanded ? "Close" : "Open"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)]/40">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="grid gap-2 text-sm">
                          <p className="type-meta font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                            Details
                          </p>
                          <p className="text-[var(--platform-text-secondary)] whitespace-pre-wrap">
                            {text(lead.message) || "No message provided."}
                          </p>
                          <p className="text-xs text-[var(--platform-text-muted)]">
                            Address: {text(lead.address) || "Not provided"}
                          </p>
                        </div>

                        {!converted ? (
                          <div className="grid gap-3">
                            <form
                              action={(formData) => {
                                startTransition(() => {
                                  void timedPush(formData);
                                });
                              }}
                              className="grid gap-2 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-3"
                            >
                              <input type="hidden" name="lead_id" value={id} />
                              <input type="hidden" name="list_status" value={listStatus} />
                              <input type="hidden" name="list_q" value={listQuery} />
                              <p className="type-meta font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
                                Push to order
                              </p>
                              <input
                                name="address"
                                defaultValue={text(lead.address)}
                                placeholder="Shipping address (optional)"
                                className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
                              />
                              <input
                                name="product_name"
                                defaultValue={text(lead.product_name)}
                                placeholder="Product name (optional)"
                                className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
                              />
                              <input
                                name="product_slug"
                                defaultValue={text(lead.product_slug)}
                                placeholder="Product slug (optional)"
                                className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm"
                              />
                              <OperationalSubmitButton
                                busy={isPending}
                                pendingLabel="Creating order..."
                                className="platform-btn-primary h-9 w-full rounded-[8px] px-3 text-xs font-medium"
                              >
                                Push to Order
                              </OperationalSubmitButton>
                            </form>

                            <form
                              action={(formData) => {
                                startTransition(() => {
                                  void timedDelete(formData);
                                });
                              }}
                              className="grid gap-2"
                            >
                              <input type="hidden" name="lead_id" value={id} />
                              <OperationalSubmitButton
                                busy={isPending}
                                pendingLabel="Deleting..."
                                confirmMessage={`Delete ${reference}? This cannot be undone.`}
                                className="h-9 w-full rounded-[8px] border border-rose-500/40 px-3 text-xs font-medium text-rose-200"
                              >
                                Delete
                              </OperationalSubmitButton>
                            </form>
                          </div>
                        ) : (
                          <div className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-3 text-sm text-[var(--platform-text-secondary)]">
                            Converted to order {text(linkedOrder?.order_number) || linkedOrderId || "—"}.
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
