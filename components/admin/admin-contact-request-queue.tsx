"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import {
  useAdminLiveResource,
  useOptionalAdminRealtime
} from "@/components/admin/realtime/admin-realtime-provider";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";
import {
  OperationalNoteField,
  OperationalPrimaryAction
} from "@/components/admin/operational-action-panel";
import { CustomerDetailsEditor } from "@/components/admin/customer-details-editor";
import { OrderItemPicker } from "@/components/admin/order-item-picker";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { OperationalWorkflowPanel } from "@/components/admin/operational-workflow-panel";
import { StatusPill } from "@/components/platform";
import type { OrderItemPickerLine } from "@/lib/admin/order-items";
import type { LinkedOrderSummary } from "@/lib/admin/linked-orders";
import {
  contactRequestMoreActionLabel,
  contactRequestMoreActions,
  contactRequestNextStepLabel,
  contactRequestPrimaryAction,
  contactRequestPrimaryActionLabel
} from "@/lib/admin/queue-workflow";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { notify } from "@/lib/feedback/notify";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { wrapServerAction } from "@/hooks/use-async-action";
import {
  billingFormFieldName,
  CONTACT_REQUEST_ADDRESS_FIELDS,
  contactRequestBillingAddress,
  contactRequestBillingSameAsShipping,
  contactRequestHasShippingAddress,
  contactRequestMissingShippingAddressFields,
  contactRequestMissingShippingAddressSummary,
  contactRequestShippingAddress,
  formatContactRequestAddress,
  formatContactRequestReference,
  getMissingContactRequestAddressFields,
  shippingFormFieldName,
  contactRequestLeadStatus,
  contactRequestMatchesLeadStatusFilter,
  contactRequestSourceLabel,
  type AdminContactRequestRow,
  type ContactRequestAddressFieldKey,
  type ContactRequestAddressView
} from "@/lib/contact-requests/shared";
import { relativeTimeLabel } from "@/lib/platform/copy";

type ContactRequestActions = {
  markContacted: (formData: FormData) => Promise<void>;
  createOrder: (formData: FormData) => Promise<void>;
  markInProgress: (formData: FormData) => Promise<void>;
  requestInfo: (formData: FormData) => Promise<void>;
  reject: (formData: FormData) => Promise<void>;
  updateAddress: (formData: FormData) => Promise<{ ok: boolean; message: string; addressFields?: string[] }>;
  updateContactDetails: (formData: FormData) => Promise<void>;
  assignWarehouse?: (formData: FormData) => Promise<void>;
};

const addressFieldClass =
  "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-focus-border)]";

const addressFieldMissingClass =
  "rounded-[8px] border border-amber-500/60 bg-amber-500/5 px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-amber-500/80";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function contactRequestPickerInitialLines(request: AdminContactRequestRow): OrderItemPickerLine[] {
  const slug = text(request.related_product_slug);
  if (!slug) return [];
  return [{
    productSlug: slug,
    productName: text(request.product_name, slug),
    quantity: 1
  }];
}

function absoluteDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata"
  });
}

function emptyAddress(defaultCountry = "India"): ContactRequestAddressView {
  return { line1: "", city: "", state: "", country: defaultCountry, postalCode: "" };
}

function addressKeyFromFormField(formField: string, prefix: "shipping" | "billing"): ContactRequestAddressFieldKey | null {
  const stripped = formField.startsWith(`${prefix}_`) ? formField.slice(prefix.length + 1) : formField;
  const match = CONTACT_REQUEST_ADDRESS_FIELDS.find((field) => field.formName === stripped || field.key === stripped);
  return match?.key ?? null;
}

function ContactRequestAddressEditor({
  contactRequestId,
  shipping,
  billing,
  billingSameAsShipping: initialBillingSame,
  defaultCountry,
  needsAddress,
  savedMissingFields,
  serverFieldHints,
  updateAddress
}: {
  contactRequestId: string;
  shipping: ContactRequestAddressView | null;
  billing: ContactRequestAddressView | null;
  billingSameAsShipping: boolean;
  defaultCountry: string;
  needsAddress: boolean;
  savedMissingFields: ContactRequestAddressFieldKey[];
  serverFieldHints: string[];
  updateAddress: (formData: FormData) => Promise<{ ok: boolean; message: string; addressFields?: string[] }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [shippingAddress, setShippingAddress] = useState<ContactRequestAddressView>(
    shipping ?? emptyAddress(defaultCountry)
  );
  const [billingAddress, setBillingAddress] = useState<ContactRequestAddressView>(
    billing ?? emptyAddress(defaultCountry)
  );
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(
    initialBillingSame || !billing
  );
  const [clientMissingShipping, setClientMissingShipping] = useState<ContactRequestAddressFieldKey[]>([]);
  const [clientMissingBilling, setClientMissingBilling] = useState<ContactRequestAddressFieldKey[]>([]);
  const [serverHints, setServerHints] = useState(serverFieldHints);
  const firstMissingRef = useRef<HTMLInputElement | null>(null);

  const serverMissingShipping = serverHints
    .map((field) => addressKeyFromFormField(field, "shipping"))
    .filter((field): field is ContactRequestAddressFieldKey => Boolean(field));
  const serverMissingBilling = serverHints
    .map((field) => addressKeyFromFormField(field, "billing"))
    .filter((field): field is ContactRequestAddressFieldKey => Boolean(field));

  const highlightedShipping = needsAddress
    ? Array.from(new Set([...savedMissingFields, ...serverMissingShipping, ...clientMissingShipping]))
    : Array.from(new Set([...serverMissingShipping, ...clientMissingShipping]));
  const highlightedBilling = Array.from(new Set([...serverMissingBilling, ...clientMissingBilling]));

  useEffect(() => {
    setServerHints(serverFieldHints);
  }, [serverFieldHints]);

  useEffect(() => {
    if (!billingSameAsShipping) return;
    setBillingAddress(shippingAddress);
  }, [billingSameAsShipping, shippingAddress]);

  useEffect(() => {
    if (!highlightedShipping.length && !highlightedBilling.length) return;
    firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    firstMissingRef.current?.focus();
  }, [highlightedShipping.length, highlightedBilling.length, serverHints.length]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextShippingMissing = getMissingContactRequestAddressFields(shippingAddress);
    const nextBillingMissing = billingSameAsShipping ? [] : getMissingContactRequestAddressFields(billingAddress);
    if (nextShippingMissing.length || nextBillingMissing.length) {
      setClientMissingShipping(nextShippingMissing);
      setClientMissingBilling(nextBillingMissing);
      return;
    }
    setClientMissingShipping([]);
    setClientMissingBilling([]);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await raceWithTimeout(
          updateAddress(formData),
          undefined,
          "Save contact address"
        );
        if (result.ok) {
          notify.success(result.message || "Customer address saved.", {
            source: "admin",
            id: "contact:address-save"
          });
          return;
        }
        if (result.addressFields?.length) {
          setServerHints(result.addressFields);
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
          source: "admin",
          id: "contact:address-save:error"
        });
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "admin", id: "contact:address-save:error" }
        );
      }
    });
  }

  function updateAddressField(
    prefix: "shipping" | "billing",
    key: ContactRequestAddressFieldKey,
    value: string
  ) {
    if (prefix === "shipping") {
      setShippingAddress((current) => ({ ...current, [key]: value }));
      if (clientMissingShipping.includes(key)) {
        setClientMissingShipping((current) => current.filter((field) => field !== key));
      }
      return;
    }
    setBillingAddress((current) => ({ ...current, [key]: value }));
    if (clientMissingBilling.includes(key)) {
      setClientMissingBilling((current) => current.filter((field) => field !== key));
    }
  }

  function renderAddressFields(
    prefix: "shipping" | "billing",
    address: ContactRequestAddressView,
    highlighted: ContactRequestAddressFieldKey[]
  ) {
    let assignedFirstMissingRef = false;

    return CONTACT_REQUEST_ADDRESS_FIELDS.map((field) => {
      const missing = highlighted.includes(field.key);
      const assignRef = missing && !assignedFirstMissingRef;
      if (assignRef) assignedFirstMissingRef = true;
      const name = prefix === "shipping" ? shippingFormFieldName(field.key) : billingFormFieldName(field.key);
      return (
        <label key={`${prefix}-${field.key}`} className="grid gap-1 text-sm">
          <span className={missing ? "text-amber-200" : "text-[var(--platform-text-muted)]"}>{field.label}</span>
          <input
            ref={assignRef ? firstMissingRef : undefined}
            required
            name={name}
            value={address[field.key]}
            aria-invalid={missing || undefined}
            onChange={(event) => updateAddressField(prefix, field.key, event.target.value)}
            className={missing ? addressFieldMissingClass : addressFieldClass}
          />
          {missing ? <span className="text-xs text-amber-200/90">Required</span> : null}
        </label>
      );
    });
  }

  const missingSummary = savedMissingFields
    .map((key) => CONTACT_REQUEST_ADDRESS_FIELDS.find((field) => field.key === key)?.label ?? key)
    .join(", ");
  const bannerMessage = needsAddress
    ? shipping
      ? missingSummary
        ? `Shipping address is incomplete. Missing: ${missingSummary}.`
        : null
      : "Shipping address is missing. Fill in the fields below and click Save address."
    : null;

  return (
    <section className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4" data-contact-request-address-editor>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Addresses</h3>

      {shipping ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Current shipping address</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-primary)]">{formatContactRequestAddress(shipping)}</p>
          </div>
          <div className="grid gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              Current billing address
              {initialBillingSame ? " · Same as shipping" : ""}
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-primary)]">
              {formatContactRequestAddress(initialBillingSame ? shipping : billing)}
            </p>
          </div>
        </div>
      ) : null}

      {bannerMessage ? (
        <p className="mb-4 rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200" role="alert">
          {bannerMessage}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <input type="hidden" name="contact_request_id" value={contactRequestId} />

        <div className="grid gap-3">
          <p className="text-sm font-medium text-[var(--platform-text-primary)]">Shipping address</p>
          <div className="grid gap-3 sm:grid-cols-2">{renderAddressFields("shipping", shippingAddress, highlightedShipping)}</div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--platform-text-secondary)]">
          <input
            type="checkbox"
            name="billing_same_as_shipping"
            checked={billingSameAsShipping}
            onChange={(event) => setBillingSameAsShipping(event.target.checked)}
            className="rounded border-[var(--platform-border)]"
          />
          Billing address is the same as shipping
        </label>

        {!billingSameAsShipping ? (
          <div className="grid gap-3">
            <p className="text-sm font-medium text-[var(--platform-text-primary)]">Billing address</p>
            <div className="grid gap-3 sm:grid-cols-2">{renderAddressFields("billing", billingAddress, highlightedBilling)}</div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
          className="platform-btn-primary h-9 w-full rounded-[8px] px-3 text-xs font-medium sm:w-auto sm:px-4 disabled:opacity-60"
        >
          {isSaving ? "Saving address..." : "Save address"}
        </button>
      </form>
    </section>
  );
}

function filterContactRequestRows(
  rows: AdminContactRequestRow[],
  statusFilter: string,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((request) => {
    if (!contactRequestMatchesLeadStatusFilter(request.status, statusFilter)) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      text(request.customer_email),
      text(request.customer_full_name),
      text(request.customer_phone),
      text(request.subject),
      text(request.body),
      text(request.product_name),
      text(request.source)
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function mergeLiveContactRequestRows(ssrRows: AdminContactRequestRow[], liveRows: AdminEntityRow[]) {
  if (!liveRows.length) return ssrRows;
  const byId = new Map(ssrRows.map((row) => [String(row.id), row]));
  for (const row of liveRows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) ?? { id }), ...row } as AdminContactRequestRow);
  }
  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = Date.parse(text(left.created_at)) || 0;
    const rightTime = Date.parse(text(right.created_at)) || 0;
    return rightTime - leftTime;
  });
}

export function AdminContactRequestQueue({
  requests,
  actions,
  initialExpandedRequestId = null,
  addressFieldHints = {},
  linkedOrders = {},
  defaultWarehouseCode = "",
  statusFilter = "",
  listQuery = ""
}: {
  requests: AdminContactRequestRow[];
  actions: ContactRequestActions;
  initialExpandedRequestId?: string | null;
  addressFieldHints?: Record<string, string[]>;
  linkedOrders?: Record<string, LinkedOrderSummary>;
  defaultWarehouseCode?: string;
  statusFilter?: string;
  listQuery?: string;
}) {
  const realtime = useOptionalAdminRealtime();
  const live = useAdminLiveResource("contact_requests", Boolean(realtime));
  const hydratedRef = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedRequestId);
  const timedRejectContactRequest = useMemo(
    () => wrapServerAction(actions.reject, { label: "Reject contact request" }),
    [actions.reject]
  );

  useEffect(() => {
    if (!realtime || hydratedRef.current) return;
    realtime.hydrateResource("contact_requests", {
      contact_requests: requests as unknown as AdminEntityRow[]
    });
    hydratedRef.current = true;
  }, [realtime, requests]);

  const liveRequests = useMemo(() => {
    const storeRows = live.collections.contact_requests ?? [];
    const merged = mergeLiveContactRequestRows(requests, storeRows);
    return filterContactRequestRows(merged, statusFilter, listQuery);
  }, [listQuery, live.collections.contact_requests, requests, statusFilter]);

  useEffect(() => {
    if (!initialExpandedRequestId) return;
    setExpandedId(initialExpandedRequestId);
  }, [initialExpandedRequestId]);

  if (!liveRequests.length) {
    return (
      <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-4 py-8 text-center text-sm text-[var(--platform-text-muted)]">
        No contact requests match this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--platform-border)]">
      <table className="min-w-full text-sm" data-contact-request-queue>
        <thead className="sticky top-0 z-10 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Source</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Email</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Phone</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Date &amp; time</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {liveRequests.map((request) => {
            const expanded = expandedId === request.id;
            const reference = formatContactRequestReference(request.request_number);
            const primary = contactRequestPrimaryAction(request);
            const leadStatus = contactRequestLeadStatus(request.status);
            const shippingAddress = contactRequestShippingAddress(request);
            const billingAddress = contactRequestBillingAddress(request);
            const needsAddress = !contactRequestHasShippingAddress(request);
            const savedMissingFields = contactRequestMissingShippingAddressFields(request);
            const missingSummary = contactRequestMissingShippingAddressSummary(request);
            const serverFieldHints = addressFieldHints[request.id] ?? [];
            const linkedOrderId = text(request.converted_order_id);
            const linkedOrder = linkedOrderId ? linkedOrders[linkedOrderId] ?? null : null;
            const availableMoreActions = contactRequestMoreActions(request);
            const workflowActions = availableMoreActions
              .map((actionKey) => {
                const hiddenFields = {
                  contact_request_id: request.id,
                  ...(request.updated_at ? { expected_updated_at: request.updated_at } : {}),
                  ...(statusFilter ? { list_status: statusFilter } : {})
                };
                if (actionKey === "markInProgress") {
                  return {
                    key: actionKey,
                    label: contactRequestMoreActionLabel(actionKey),
                    action: actions.markInProgress,
                    pendingLabel: "Saving...",
                    hiddenFields,
                    notePlaceholder: "Progress note (optional)"
                  };
                }
                if (actionKey === "requestInfo") {
                  return {
                    key: actionKey,
                    label: contactRequestMoreActionLabel(actionKey),
                    action: actions.requestInfo,
                    pendingLabel: "Sending...",
                    hiddenFields,
                    notePlaceholder: "Internal note (optional)"
                  };
                }
                if (actionKey === "reject") {
                  return {
                    key: actionKey,
                    label: contactRequestMoreActionLabel(actionKey),
                    action: actions.reject,
                    pendingLabel: "Cancelling...",
                    variant: "danger" as const,
                    hiddenFields,
                    notePlaceholder: "Reason (optional)"
                  };
                }
                return null;
              })
              .filter((action): action is NonNullable<typeof action> => Boolean(action));

            return (
              <Fragment key={request.id}>
                <tr className="border-b border-[var(--platform-border)] hover:bg-[var(--platform-surface-muted)]/60">
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <p className="font-medium text-[var(--platform-text-primary)]">
                      {contactRequestSourceLabel(request.source)}
                    </p>
                    <p className="text-xs text-[var(--platform-text-muted)]">{reference}</p>
                  </td>
                  <td className="px-3 py-3 text-[var(--platform-text-secondary)]">
                    {text(request.product_name, "—")}
                  </td>
                  <td className="px-3 py-3 font-medium text-[var(--platform-text-primary)]">
                    {text(request.customer_full_name, "—")}
                  </td>
                  <td className="hidden px-3 py-3 text-[var(--platform-text-secondary)] xl:table-cell">{request.customer_email}</td>
                  <td className="hidden px-3 py-3 text-[var(--platform-text-secondary)] xl:table-cell">{text(request.customer_phone, "—")}</td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <p className="text-[var(--platform-text-secondary)]">{absoluteDateTime(request.created_at)}</p>
                    <p className="text-xs text-[var(--platform-text-muted)]">
                      Updated {relativeTimeLabel(request.updated_at ?? request.created_at ?? "")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={leadStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {availableMoreActions.includes("reject") ? (
                        <form action={timedRejectContactRequest} className="inline-flex">
                          <input type="hidden" name="contact_request_id" value={request.id} />
                          {statusFilter ? <input type="hidden" name="list_status" value={statusFilter} /> : null}
                          {request.updated_at ? (
                            <input type="hidden" name="expected_updated_at" value={text(request.updated_at)} />
                          ) : null}
                          <OperationalSubmitButton
                            pendingLabel="Cancelling..."
                            confirmMessage={`Cancel contact request ${reference}?`}
                            className="text-sm font-medium text-rose-300 hover:underline"
                          >
                            Cancel
                          </OperationalSubmitButton>
                        </form>
                      ) : null}
                      <button
                        type="button"
                        className="text-sm font-medium text-[var(--platform-accent)]"
                        onClick={() => setExpandedId(expanded ? null : request.id)}
                      >
                        {expanded ? "Hide" : "Manage"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)]/40">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <p className="text-xs uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
                              {reference} · {request.subject}
                            </p>
                            <p className="text-sm text-[var(--platform-text-secondary)]">
                              Next step: {contactRequestNextStepLabel(request)}
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-secondary)]">{request.body}</p>
                          </div>

                          <CustomerDetailsEditor
                            recordId={request.id}
                            idFieldName="contact_request_id"
                            fullName={text(request.customer_full_name)}
                            email={request.customer_email}
                            phone={text(request.customer_phone)}
                            company={text(request.customer_company)}
                            updateDetails={actions.updateContactDetails}
                          />

                          <ContactRequestAddressEditor
                            contactRequestId={request.id}
                            shipping={shippingAddress}
                            billing={billingAddress}
                            billingSameAsShipping={contactRequestBillingSameAsShipping(request)}
                            defaultCountry={text(request.region, "India")}
                            needsAddress={needsAddress}
                            savedMissingFields={savedMissingFields}
                            serverFieldHints={serverFieldHints}
                            updateAddress={actions.updateAddress}
                          />
                        </div>

                        <aside className="grid gap-3">
                          {primary === "contact" ? (
                            <OperationalPrimaryAction
                              description={contactRequestNextStepLabel(request)}
                              action={actions.markContacted}
                              buttonLabel={contactRequestPrimaryActionLabel(primary)}
                              pendingLabel="Saving..."
                            >
                              <input type="hidden" name="contact_request_id" value={request.id} />
                              {request.updated_at ? (
                                <input type="hidden" name="expected_updated_at" value={request.updated_at} />
                              ) : null}
                              {statusFilter ? <input type="hidden" name="list_status" value={statusFilter} /> : null}
                              <OperationalNoteField placeholder="Contact note (optional)" />
                            </OperationalPrimaryAction>
                          ) : null}

                          {primary === "createOrder" ? (
                            <OperationalPrimaryAction
                              description={
                                missingSummary
                                  ? `${contactRequestNextStepLabel(request)} Missing: ${missingSummary}.`
                                  : contactRequestNextStepLabel(request)
                              }
                              action={actions.createOrder}
                              buttonLabel={contactRequestPrimaryActionLabel(primary)}
                              pendingLabel="Creating order..."
                            >
                              <input type="hidden" name="contact_request_id" value={request.id} />
                              {request.updated_at ? (
                                <input type="hidden" name="expected_updated_at" value={request.updated_at} />
                              ) : null}
                              {statusFilter ? <input type="hidden" name="list_status" value={statusFilter} /> : null}
                              <OrderItemPicker initialLines={contactRequestPickerInitialLines(request)} />
                            </OperationalPrimaryAction>
                          ) : null}

                          {primary === "none" ? (
                            <div className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 text-sm text-[var(--platform-text-secondary)]">
                              {contactRequestNextStepLabel(request)}
                            </div>
                          ) : null}

                          {workflowActions.length || linkedOrder ? (
                            <OperationalWorkflowPanel
                              actions={workflowActions}
                              linkedOrder={linkedOrder}
                              defaultWarehouseCode={defaultWarehouseCode}
                              assignWarehouseAction={actions.assignWarehouse}
                              returnPath="/admin/contact-requests"
                            />
                          ) : null}
                        </aside>
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
