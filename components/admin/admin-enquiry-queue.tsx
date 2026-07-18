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
import type { LinkedOrderSummary } from "@/lib/admin/linked-orders";
import type { OrderItemPickerLine } from "@/lib/admin/order-items";
import {
  enquiryMoreActionLabel,
  enquiryMoreActions,
  enquiryNextStepLabel,
  enquiryPrimaryAction,
  enquiryPrimaryActionLabel
} from "@/lib/admin/queue-workflow";
import { relativeTimeLabel } from "@/lib/platform/copy";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { notify } from "@/lib/feedback/notify";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { wrapServerAction } from "@/hooks/use-async-action";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  billingFormFieldName,
  ENQUIRY_ADDRESS_FIELDS,
  enquiryBillingAddress,
  enquiryBillingSameAsShipping,
  enquiryCartLines,
  enquiryCustomerCompany,
  enquiryCustomerName,
  enquiryCustomerPhone,
  enquiryHasShippingAddress,
  enquiryMessageText,
  enquiryMissingShippingAddressFields,
  enquiryMissingShippingAddressSummary,
  enquiryPreferredContactMethod,
  enquiryProductId,
  enquiryProductLabel,
  enquiryProductSku,
  enquiryProductUrl,
  enquiryRegion,
  enquiryShippingAddress,
  enquirySourceLabel,
  formatEnquiryAddress,
  formatEnquiryDateTime,
  formatEnquiryReference,
  getMissingEnquiryAddressFields,
  shippingFormFieldName,
  type AdminEnquiryRow,
  type EnquiryAddressFieldKey,
  type EnquiryAddressView
} from "@/lib/enquiries/shared";

type EnquiryActionResult = {
  ok?: boolean;
  message?: string;
  addressFields?: string[];
};

type EnquiryActions = {
  markContacted: (formData: FormData) => Promise<EnquiryActionResult | void>;
  addNote: (formData: FormData) => Promise<EnquiryActionResult | void>;
  convert: (formData: FormData) => Promise<EnquiryActionResult | void>;
  close: (formData: FormData) => Promise<EnquiryActionResult | void>;
  markInProgress: (formData: FormData) => Promise<EnquiryActionResult | void>;
  complete: (formData: FormData) => Promise<EnquiryActionResult | void>;
  requestInfo: (formData: FormData) => Promise<EnquiryActionResult | void>;
  cancel: (formData: FormData) => Promise<EnquiryActionResult | void>;
  updateMeta: (formData: FormData) => Promise<EnquiryActionResult | void>;
  updateAddress: (formData: FormData) => Promise<{ ok: boolean; message: string; addressFields?: string[] }>;
  updateContactDetails: (formData: FormData) => Promise<EnquiryActionResult | void>;
  assignWarehouse?: (formData: FormData) => Promise<void>;
};

function ListContextFields({ listStatus, listQuery }: { listStatus: string; listQuery: string }) {
  return (
    <>
      <input type="hidden" name="list_status" value={listStatus} />
      <input type="hidden" name="list_q" value={listQuery} />
    </>
  );
}

const addressFieldClass =
  "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-focus-border)]";

const addressFieldMissingClass =
  "rounded-[8px] border border-amber-500/60 bg-amber-500/5 px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-amber-500/80";

function emptyAddress(defaultCountry = "India"): EnquiryAddressView {
  return { line1: "", city: "", state: "", country: defaultCountry, postalCode: "" };
}

function addressKeyFromFormField(formField: string, prefix: "shipping" | "billing"): EnquiryAddressFieldKey | null {
  const stripped = formField.startsWith(`${prefix}_`) ? formField.slice(prefix.length + 1) : formField;
  const match = ENQUIRY_ADDRESS_FIELDS.find((field) => field.formName === stripped || field.key === stripped);
  return match?.key ?? null;
}

function addressBannerMessage(savedShipping: EnquiryAddressView | null, missingSummary: string | null) {
  if (!savedShipping) {
    return "Shipping address is missing. Fill in the fields below and click Save address.";
  }
  if (missingSummary) {
    return `Shipping address is incomplete. Missing: ${missingSummary}.`;
  }
  return null;
}

function AddressFieldInput({
  prefix,
  field,
  value,
  missing,
  inputRef,
  onChange
}: {
  prefix: "shipping" | "billing";
  field: (typeof ENQUIRY_ADDRESS_FIELDS)[number];
  value: string;
  missing: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const name = prefix === "shipping" ? shippingFormFieldName(field.key) : billingFormFieldName(field.key);
  return (
    <label className="grid gap-1 text-sm">
      <span className={missing ? "text-amber-200" : "text-[var(--platform-text-muted)]"}>{field.label}</span>
      <input
        ref={inputRef}
        required
        name={name}
        value={value}
        aria-invalid={missing || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={missing ? addressFieldMissingClass : addressFieldClass}
      />
      {missing ? <span className="text-xs text-amber-200/90">Required</span> : null}
    </label>
  );
}

function EnquiryAddressEditor({
  enquiryId,
  shipping,
  billing,
  billingSameAsShipping: initialBillingSame,
  defaultCountry,
  needsAddress,
  savedMissingFields,
  serverFieldHints,
  listStatus,
  listQuery,
  updateAddress
}: {
  enquiryId: string;
  shipping: EnquiryAddressView | null;
  billing: EnquiryAddressView | null;
  billingSameAsShipping: boolean;
  defaultCountry: string;
  needsAddress: boolean;
  savedMissingFields: EnquiryAddressFieldKey[];
  serverFieldHints: string[];
  listStatus: string;
  listQuery: string;
  updateAddress: (formData: FormData) => Promise<{ ok: boolean; message: string; addressFields?: string[] }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [shippingAddress, setShippingAddress] = useState<EnquiryAddressView>(
    shipping ?? emptyAddress(defaultCountry)
  );
  const [billingAddress, setBillingAddress] = useState<EnquiryAddressView>(
    billing ?? emptyAddress(defaultCountry)
  );
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(
    initialBillingSame || !billing
  );
  const [clientMissingShipping, setClientMissingShipping] = useState<EnquiryAddressFieldKey[]>([]);
  const [clientMissingBilling, setClientMissingBilling] = useState<EnquiryAddressFieldKey[]>([]);
  const [serverHints, setServerHints] = useState(serverFieldHints);
  const firstMissingRef = useRef<HTMLInputElement | null>(null);

  const serverMissingShipping = serverHints
    .map((field) => addressKeyFromFormField(field, "shipping"))
    .filter((field): field is EnquiryAddressFieldKey => Boolean(field));
  const serverMissingBilling = serverHints
    .map((field) => addressKeyFromFormField(field, "billing"))
    .filter((field): field is EnquiryAddressFieldKey => Boolean(field));

  const highlightedShipping = needsAddress
    ? Array.from(new Set([...savedMissingFields, ...serverMissingShipping, ...clientMissingShipping]))
    : Array.from(new Set([...serverMissingShipping, ...clientMissingShipping]));
  const highlightedBilling = Array.from(new Set([...serverMissingBilling, ...clientMissingBilling]));

  const missingSummary = formatMissingSummary(savedMissingFields);
  const bannerMessage = needsAddress ? addressBannerMessage(shipping, missingSummary) : null;

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
    const nextShippingMissing = getMissingEnquiryAddressFields(shippingAddress);
    const nextBillingMissing = billingSameAsShipping ? [] : getMissingEnquiryAddressFields(billingAddress);
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
          "Save enquiry address"
        );
        if (result.ok) {
          notify.success(result.message || "Customer address saved.", {
            source: "admin",
            id: "enquiry:address-save"
          });
          return;
        }
        if (result.addressFields?.length) {
          setServerHints(result.addressFields);
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
          source: "admin",
          id: "enquiry:address-save:error"
        });
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "admin", id: "enquiry:address-save:error" }
        );
      }
    });
  }

  function updateAddressField(
    prefix: "shipping" | "billing",
    key: EnquiryAddressFieldKey,
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
    address: EnquiryAddressView,
    highlighted: EnquiryAddressFieldKey[]
  ) {
    let assignedFirstMissingRef = false;

    function fieldInput(field: (typeof ENQUIRY_ADDRESS_FIELDS)[number]) {
      const missing = highlighted.includes(field.key);
      const assignRef = missing && !assignedFirstMissingRef;
      if (assignRef) assignedFirstMissingRef = true;
      return (
        <AddressFieldInput
          key={`${prefix}-${field.key}`}
          prefix={prefix}
          field={field}
          value={address[field.key]}
          missing={missing}
          inputRef={assignRef ? firstMissingRef : undefined}
          onChange={(value) => updateAddressField(prefix, field.key, value)}
        />
      );
    }

    const line1Field = ENQUIRY_ADDRESS_FIELDS.find((field) => field.key === "line1");
    const cityStateFields = ENQUIRY_ADDRESS_FIELDS.filter((field) => field.key === "city" || field.key === "state");
    const postalCountryFields = ENQUIRY_ADDRESS_FIELDS.filter((field) => field.key === "postalCode" || field.key === "country");

    return (
      <>
        {line1Field ? fieldInput(line1Field) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {cityStateFields.map((field) => fieldInput(field))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {postalCountryFields.map((field) => fieldInput(field))}
        </div>
      </>
    );
  }

  return (
    <section className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4" data-enquiry-address-editor>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Addresses</h3>

      {shipping ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Current shipping address</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-primary)]">{formatEnquiryAddress(shipping)}</p>
          </div>
          <div className="grid gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              Current billing address
              {initialBillingSame ? " · Same as shipping" : ""}
            </p>
            <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-primary)]">
              {formatEnquiryAddress(initialBillingSame ? shipping : billing)}
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
        <input type="hidden" name="enquiry_id" value={enquiryId} />
        <ListContextFields listStatus={listStatus} listQuery={listQuery} />

        <div className="grid gap-3">
          <p className="text-sm font-medium text-[var(--platform-text-primary)]">Shipping address</p>
          {renderAddressFields("shipping", shippingAddress, highlightedShipping)}
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
            {renderAddressFields("billing", billingAddress, highlightedBilling)}
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

function enquiryPickerInitialLines(enquiry: AdminEnquiryRow): OrderItemPickerLine[] {
  const cartLines = enquiryCartLines(enquiry);
  if (cartLines.length) {
    return cartLines.map((line) => ({
      productSlug: line.product_slug,
      productName: line.product_name,
      quantity: line.quantity
    }));
  }
  const slug = text(enquiry.related_product_slug);
  if (slug) {
    return [{
      productSlug: slug,
      productName: enquiryProductLabel(enquiry),
      quantity: 1
    }];
  }
  return [];
}

function formatMissingSummary(fields: EnquiryAddressFieldKey[]) {
  if (!fields.length) return null;
  return fields
    .map((key) => ENQUIRY_ADDRESS_FIELDS.find((field) => field.key === key)?.label ?? key)
    .join(", ");
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function InfoField({ label, value }: { label: string; value: string }) {
  const trimmed = value?.trim() || "";
  const isUrl = /^https?:\/\//i.test(trimmed);
  return (
    <div className="grid gap-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">{label}</p>
      {isUrl ? (
        <a
          href={trimmed}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm font-medium text-[var(--platform-accent)]"
        >
          {trimmed}
        </a>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-[var(--platform-text-primary)]">{trimmed || "—"}</p>
      )}
    </div>
  );
}

function filterEnquiryRows(rows: AdminEnquiryRow[], listStatus: string, listQuery: string) {
  const query = listQuery.trim().toLowerCase();
  return rows.filter((enquiry) => {
    if (listStatus && listStatus !== "all" && text(enquiry.status) !== listStatus) return false;
    if (!query) return true;
    const haystack = [enquiry.customer_email, enquiry.subject, enquiry.body]
      .map((value) => text(value).toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });
}

function mergeLiveEnquiryRows(ssrRows: AdminEnquiryRow[], liveRows: AdminEntityRow[]) {
  if (!liveRows.length) return ssrRows;
  const byId = new Map(ssrRows.map((row) => [String(row.id), row]));
  for (const row of liveRows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) ?? { id }), ...row } as AdminEnquiryRow);
  }
  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = Date.parse(text(left.created_at)) || 0;
    const rightTime = Date.parse(text(right.created_at)) || 0;
    return rightTime - leftTime;
  });
}

export function AdminEnquiryQueue({
  enquiries,
  actions,
  listStatus = "all",
  listQuery = "",
  initialExpandedEnquiryId = null,
  addressFieldHints = {},
  linkedOrders = {},
  defaultWarehouseCode = ""
}: {
  enquiries: AdminEnquiryRow[];
  actions: EnquiryActions;
  listStatus?: string;
  listQuery?: string;
  initialExpandedEnquiryId?: string | null;
  addressFieldHints?: Record<string, string[]>;
  linkedOrders?: Record<string, LinkedOrderSummary>;
  defaultWarehouseCode?: string;
}) {
  const searchParams = useSearchParams();
  const realtime = useOptionalAdminRealtime();
  const live = useAdminLiveResource("enquiries", Boolean(realtime));
  const hydratedRef = useRef(false);
  const openFromUrl = searchParams.get("open")?.trim() || searchParams.get("enquiry_id")?.trim() || null;
  const seedExpandedId = openFromUrl || initialExpandedEnquiryId;
  const [expandedId, setExpandedId] = useState<string | null>(seedExpandedId);
  const expandedRowRef = useRef<HTMLTableRowElement | null>(null);
  const timedCancelEnquiry = useMemo(
    () =>
      wrapServerAction(async (formData: FormData) => {
        const result = await actions.cancel(formData);
        if (result && typeof result === "object") {
          const message = String(result.message ?? "").trim();
          if (message) {
            if (result.ok === false) notify.error(message);
            else notify.success(message);
          }
        }
      }, { label: "Cancel enquiry" }),
    [actions.cancel]
  );

  useEffect(() => {
    if (!realtime || hydratedRef.current) return;
    realtime.hydrateResource("enquiries", {
      enquiries: enquiries as unknown as AdminEntityRow[]
    });
    hydratedRef.current = true;
  }, [enquiries, realtime]);

  const liveEnquiries = useMemo(() => {
    const storeRows = live.collections.enquiries ?? [];
    const merged = mergeLiveEnquiryRows(enquiries, storeRows);
    return filterEnquiryRows(merged, listStatus, listQuery);
  }, [enquiries, listQuery, listStatus, live.collections.enquiries]);

  useEffect(() => {
    if (!seedExpandedId) return;
    setExpandedId(seedExpandedId);
  }, [seedExpandedId]);

  useEffect(() => {
    if (!expandedId) return;
    expandedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expandedId]);

  if (!liveEnquiries.length) {
    return (
      <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] px-4 py-8 text-center text-sm text-[var(--platform-text-muted)]">
        No enquiries match this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--platform-border)]">
      <table className="min-w-full text-sm" data-enquiry-queue>
        <thead className="sticky top-0 z-10 border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Phone</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Source</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Next step</th>
            <th className="hidden px-3 py-2 font-medium xl:table-cell">Received</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {liveEnquiries.map((enquiry) => {
            const id = String(enquiry.id);
            const expanded = expandedId === id;
            const source = text(enquiry.source, "contact");
            const orderNumber = text(enquiry.order_number);
            const queueKind = text(enquiry.queue_kind, "enquiry");
            const reference = enquiry.enquiry_number ? formatEnquiryReference(enquiry.enquiry_number) : text(enquiry.subject, "Enquiry");
            const notes = Array.isArray(enquiry.notes) ? enquiry.notes : [];
            const timeline = Array.isArray(enquiry.timeline) ? enquiry.timeline : [];
            const cartLines = enquiryCartLines(enquiry);
            const customerName = enquiryCustomerName(enquiry);
            const shippingAddress = enquiryShippingAddress(enquiry);
            const billingAddress = enquiryBillingAddress(enquiry);
            const primaryAction = enquiryPrimaryAction(enquiry);
            const savedMissingFields = enquiryMissingShippingAddressFields(enquiry);
            const missingSummary = enquiryMissingShippingAddressSummary(enquiry);
            const serverFieldHints = addressFieldHints[id] ?? [];
            const linkedOrderId = text(enquiry.order_id) || text(enquiry.converted_order_id);
            const linkedOrder = linkedOrderId ? linkedOrders[linkedOrderId] ?? null : null;
            const availableMoreActions = enquiryMoreActions(enquiry);
            const workflowActions = availableMoreActions
              .map((actionKey) => {
                const hiddenFields: Record<string, string> = {
                  enquiry_id: id,
                  list_status: listStatus,
                  list_q: listQuery,
                  ...(text(enquiry.updated_at) ? { expected_updated_at: text(enquiry.updated_at) } : {})
                };
                if (queueKind === "checkout_order") {
                  hiddenFields.order_id = id;
                  hiddenFields.queue_kind = queueKind;
                }

                if (actionKey === "markInProgress") {
                  return {
                    key: actionKey,
                    label: enquiryMoreActionLabel(actionKey),
                    action: actions.markInProgress,
                    pendingLabel: "Saving...",
                    hiddenFields,
                    notePlaceholder: "Progress note (optional)"
                  };
                }
                if (actionKey === "complete") {
                  return {
                    key: actionKey,
                    label: enquiryMoreActionLabel(actionKey),
                    action: actions.complete,
                    pendingLabel: "Saving...",
                    hiddenFields,
                    notePlaceholder: "Completion note (optional)"
                  };
                }
                if (actionKey === "requestInfo") {
                  return {
                    key: actionKey,
                    label: enquiryMoreActionLabel(actionKey),
                    action: actions.requestInfo,
                    pendingLabel: "Sending...",
                    hiddenFields,
                    notePlaceholder: "Internal note (optional)"
                  };
                }
                if (actionKey === "close") {
                  return {
                    key: actionKey,
                    label: enquiryMoreActionLabel(actionKey),
                    action: actions.close,
                    pendingLabel: "Closing...",
                    variant: "danger" as const,
                    hiddenFields,
                    notePlaceholder: "Reason (optional)"
                  };
                }
                if (actionKey === "cancel") {
                  return {
                    key: actionKey,
                    label: enquiryMoreActionLabel(actionKey),
                    action: actions.cancel,
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
              <Fragment key={id}>
                <tr
                  ref={expanded ? expandedRowRef : undefined}
                  data-enquiry-row
                  data-enquiry-status={text(enquiry.status, "new")}
                  className="border-b border-[var(--platform-border)]"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-[var(--platform-text-primary)]">{customerName}</p>
                    <p className="text-xs text-[var(--platform-text-muted)]">{text(enquiry.customer_email, "—")}</p>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--platform-text-secondary)] xl:table-cell">{enquiryCustomerPhone(enquiry) || "—"}</td>
                  <td className="hidden px-3 py-2.5 xl:table-cell">
                    <span className="rounded-md border border-[var(--platform-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--platform-text-muted)]">
                      {source === "checkout" ? "Checkout" : "Contact"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--platform-text-secondary)]">{enquiryProductLabel(enquiry)}</td>
                  <td className="px-3 py-2.5"><StatusPill status={text(enquiry.status, "new")} /></td>
                  <td className="hidden px-3 py-2.5 text-xs font-medium text-[var(--platform-text-primary)] xl:table-cell">{enquiryNextStepLabel(enquiry)}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-[var(--platform-text-muted)] xl:table-cell">{relativeTimeLabel(text(enquiry.created_at))}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {availableMoreActions.includes("cancel") ? (
                        <form action={timedCancelEnquiry} className="inline-flex">
                          <input type="hidden" name="enquiry_id" value={id} />
                          <input type="hidden" name="list_status" value={listStatus} />
                          <input type="hidden" name="list_q" value={listQuery} />
                          {enquiry.updated_at ? (
                            <input type="hidden" name="expected_updated_at" value={text(enquiry.updated_at)} />
                          ) : null}
                          <OperationalSubmitButton
                            pendingLabel="Cancelling..."
                            confirmMessage={`Cancel enquiry ${reference}?`}
                            className="text-xs font-medium text-rose-300 hover:underline"
                          >
                            Cancel
                          </OperationalSubmitButton>
                        </form>
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
                  <tr className="border-b border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
                    <td colSpan={8} className="px-4 py-5">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--platform-border)] pb-4">
                        <div>
                          <p className="text-lg font-semibold text-[var(--platform-text-primary)]">{reference}</p>
                          <p className="mt-1 text-xs text-[var(--platform-text-muted)]">
                            {formatEnquiryDateTime(enquiry.created_at)}
                            {enquiry.updated_at ? ` · Updated ${relativeTimeLabel(text(enquiry.updated_at))}` : ""}
                          </p>
                        </div>
                        <div className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-xs">
                          <span className="text-[var(--platform-text-muted)]">Next step</span>
                          <p className="mt-1 font-semibold text-[var(--platform-accent)]">{enquiryNextStepLabel(enquiry)}</p>
                        </div>
                      </div>

                      <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="grid gap-4">
                          <CustomerDetailsEditor
                            recordId={id}
                            idFieldName="enquiry_id"
                            fullName={customerName}
                            email={text(enquiry.customer_email)}
                            phone={enquiryCustomerPhone(enquiry)}
                            company={enquiryCustomerCompany(enquiry)}
                            updateDetails={actions.updateContactDetails}
                            hiddenFields={{
                              list_status: listStatus,
                              list_q: listQuery
                            }}
                          />

                          <EnquiryAddressEditor
                            enquiryId={id}
                            shipping={shippingAddress}
                            billing={billingAddress}
                            billingSameAsShipping={enquiryBillingSameAsShipping(enquiry)}
                            defaultCountry={enquiryRegion(enquiry) || "India"}
                            needsAddress={!enquiryHasShippingAddress(enquiry)}
                            savedMissingFields={savedMissingFields}
                            serverFieldHints={serverFieldHints}
                            listStatus={listStatus}
                            listQuery={listQuery}
                            updateAddress={actions.updateAddress}
                          />

                          <section className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Customer context</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <InfoField label="Country" value={enquiryRegion(enquiry)} />
                              <InfoField label="Preferred contact" value={enquiryPreferredContactMethod(enquiry)} />
                            </div>
                          </section>

                          <section className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Enquiry</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <InfoField label="Enquiry ID" value={reference} />
                              <InfoField label="Source" value={enquirySourceLabel(enquiry)} />
                              <InfoField label="Status" value={text(enquiry.status, "new")} />
                              <InfoField label="Product of interest" value={enquiryProductLabel(enquiry)} />
                              <InfoField label="Product ID" value={enquiryProductId(enquiry)} />
                              <InfoField label="Product SKU" value={enquiryProductSku(enquiry)} />
                              <InfoField label="Product URL" value={enquiryProductUrl(enquiry)} />
                            </div>
                            {cartLines.length ? (
                              <div className="mt-4 grid gap-2">
                                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Requested items</p>
                                {cartLines.map((line) => (
                                  <div key={`${line.product_slug}-${line.product_name}`} className="flex items-center justify-between rounded-[8px] border border-[var(--platform-border)] px-3 py-2 text-sm">
                                    <span className="text-[var(--platform-text-primary)]">{line.product_name}</span>
                                    <span className="text-[var(--platform-text-muted)]">Qty {line.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-4 grid gap-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Customer message</p>
                              <p className="whitespace-pre-wrap rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-3 text-sm leading-relaxed text-[var(--platform-text-secondary)]">
                                {enquiryMessageText(enquiry) || "—"}
                              </p>
                            </div>
                            {orderNumber ? (
                              <Link href={`/admin/orders?order=${encodeURIComponent(orderNumber)}&queue=review`} className="mt-3 inline-flex text-sm font-medium text-[var(--platform-accent)]">
                                View linked order {orderNumber}
                              </Link>
                            ) : null}
                          </section>

                          {notes.length || timeline.length ? (
                            <section className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
                              {notes.length ? (
                                <div className="grid gap-2">
                                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Internal notes</h3>
                                  {notes.slice(0, 4).map((note) => (
                                    <div key={note.id} className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-secondary)]">
                                      {note.body}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {timeline.length ? (
                                <div className={`grid gap-1 ${notes.length ? "mt-4" : ""}`}>
                                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Timeline</h3>
                                  {timeline.slice(0, 6).map((entry, index) => (
                                    <div key={`${entry.at}-${index}`} className="flex justify-between gap-2 text-xs text-[var(--platform-text-muted)]">
                                      <span>{entry.summary}</span>
                                      <span>{relativeTimeLabel(entry.at)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                          ) : null}
                        </div>

                        <aside className="grid gap-3">
                          {(() => {
                            if (primaryAction === "contact") {
                              return (
                                <OperationalPrimaryAction
                                  description={enquiryNextStepLabel(enquiry)}
                                  action={actions.markContacted}
                                  buttonLabel={enquiryPrimaryActionLabel(primaryAction)}
                                  pendingLabel="Saving"
                                >
                                  <input type="hidden" name="enquiry_id" value={id} />
                                  <input type="hidden" name="order_id" value={queueKind === "checkout_order" ? id : ""} />
                                  <input type="hidden" name="queue_kind" value={queueKind} />
                                  {text(enquiry.updated_at) ? (
                                    <input type="hidden" name="expected_updated_at" value={text(enquiry.updated_at)} />
                                  ) : null}
                                  <ListContextFields listStatus={listStatus} listQuery={listQuery} />
                                  <OperationalNoteField placeholder="Contact notes (optional)" />
                                </OperationalPrimaryAction>
                              );
                            }
                            if (primaryAction === "convert") {
                              return (
                                <OperationalPrimaryAction
                                  description={enquiryNextStepLabel(enquiry)}
                                  action={actions.convert}
                                  buttonLabel={enquiryPrimaryActionLabel(primaryAction)}
                                  pendingLabel="Converting"
                                >
                                  <input type="hidden" name="enquiry_id" value={id} />
                                  <input type="hidden" name="order_id" value={queueKind === "checkout_order" ? id : ""} />
                                  <input type="hidden" name="queue_kind" value={queueKind} />
                                  {text(enquiry.updated_at) ? (
                                    <input type="hidden" name="expected_updated_at" value={text(enquiry.updated_at)} />
                                  ) : null}
                                  <ListContextFields listStatus={listStatus} listQuery={listQuery} />
                                  <OrderItemPicker initialLines={enquiryPickerInitialLines(enquiry)} />
                                </OperationalPrimaryAction>
                              );
                            }
                            return (
                              <div className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 text-sm text-[var(--platform-text-secondary)]">
                                {enquiryNextStepLabel(enquiry)}
                              </div>
                            );
                          })()}

                          {workflowActions.length || linkedOrder ? (
                            <OperationalWorkflowPanel
                              actions={workflowActions}
                              linkedOrder={linkedOrder}
                              defaultWarehouseCode={defaultWarehouseCode}
                              assignWarehouseAction={actions.assignWarehouse}
                              returnPath="/admin/enquiries"
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
