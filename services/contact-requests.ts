import { assertSupabaseAdminConfig } from "@/lib/env";
import {
  type AdminContactRequestRow,
  type ContactRequestLeadSource,
  type ContactRequestNoteEntry,
  type ContactRequestTimelineEntry,
  formatContactRequestReference,
  normalizeContactRequestLeadSource
} from "@/lib/contact-requests/shared";
import {
  ADMIN_MUTATION_TIMEOUT_MS,
  createActivityLogRecord,
  createAdminRecord,
  createNotificationRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { resolveCheckoutStockSkus } from "@/services/checkout-stock";
import { buildValidatedOrderDraft } from "@/services/orders";
import { operationalArchiveHotCutoffIso } from "@/services/data-archive";
import type { ConversionLineItem } from "@/lib/admin/order-items";

export type { AdminContactRequestRow, ContactRequestLeadSource, ContactRequestNoteEntry, ContactRequestTimelineEntry } from "@/lib/contact-requests/shared";
export {
  contactRequestLeadStatus,
  contactRequestLeadStatusLabel,
  contactRequestMatchesLeadStatusFilter,
  contactRequestSourceLabel,
  formatContactRequestReference,
  normalizeContactRequestLeadSource
} from "@/lib/contact-requests/shared";

export type ContactRequestInput = {
  customerUserId?: string | null;
  customerEmail: string;
  customerPhone: string;
  customerFullName: string;
  customerCompany?: string | null;
  subject: string;
  body: string;
  region?: string | null;
  source?: ContactRequestLeadSource;
  productName?: string | null;
  relatedProductSlug?: string | null;
  idempotencyKey?: string | null;
};

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPayload(value: unknown) {
  return isPlainRecord(value) ? value : {};
}

function readTimeline(payload: JsonRecord): ContactRequestTimelineEntry[] {
  const timeline = payload.timeline;
  return Array.isArray(timeline)
    ? timeline.filter(isPlainRecord).map((entry) => ({
      at: text(entry.at),
      action: text(entry.action),
      actor_id: typeof entry.actor_id === "string" ? entry.actor_id : null,
      summary: text(entry.summary),
      status: text(entry.status) || undefined
    }))
    : [];
}

function readNotes(payload: JsonRecord): ContactRequestNoteEntry[] {
  const notes = payload.notes;
  return Array.isArray(notes)
    ? notes.filter(isPlainRecord).map((entry) => ({
      id: text(entry.id, crypto.randomUUID()),
      at: text(entry.at),
      actor_id: text(entry.actor_id),
      body: text(entry.body)
    }))
    : [];
}

function contactMutationOptions() {
  // Public contact submissions are persisted via the service role after API auth/rate limits.
  return { allowSystemActor: true };
}

async function listAdminRecipientIds(roleKey: string, env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/user_roles?select=user_id&role_key=eq.${encodeURIComponent(roleKey)}&limit=40`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{ user_id?: string }>;
  return rows.map((row) => text(row.user_id)).filter(Boolean);
}

async function notifyAdminsAboutContactRequest(
  input: { contactRequestId: string; title: string; body: string; actorId: string | null },
  env: EnvSource = process.env
) {
  const policy = await getAdminSettingsPolicy(env);
  if (!policy.orderAlertsEnabled) return;

  const adminIds = await listAdminRecipientIds("admin", env);
  for (const recipientId of adminIds) {
    await createNotificationRecord(
      {
        recipient_id: recipientId,
        channel: "in_app",
        title: input.title,
        body: input.body,
        status: "unread",
        priority: "high",
        entity_table: "contact_requests",
        entity_id: input.contactRequestId
      },
      input.actorId,
      env,
      input.actorId ? {} : { allowSystemActor: true }
    ).catch(() => undefined);
  }
}

async function loadContactRequest(contactRequestId: string, env: EnvSource) {
  const rows = await fetchAdminRecordsByColumn("contact_requests", "id", contactRequestId, env);
  const row = rows[0];
  if (!row) throw new Error("Contact request not found.");
  return row;
}

async function persistContactRequestUpdate(
  contactRequestId: string,
  input: {
    actorId: string;
    nextStatus?: string;
    assignedTo?: string | null;
    note?: string;
    timelineAction: string;
    timelineSummary: string;
    patch?: JsonRecord;
    expectedUpdatedAt?: string | null;
  },
  env: EnvSource = process.env
) {
  const record = await loadContactRequest(contactRequestId, env);
  const payload = readPayload(record.payload);
  const timeline = readTimeline(payload);
  const notes = readNotes(payload);
  const now = new Date().toISOString();
  const expectedUpdatedAt = input.expectedUpdatedAt ?? (text(record.updated_at) || null);

  timeline.unshift({
    at: now,
    action: input.timelineAction,
    actor_id: input.actorId,
    summary: input.timelineSummary,
    status: input.nextStatus
  });

  if (input.note?.trim()) {
    notes.unshift({
      id: crypto.randomUUID(),
      at: now,
      actor_id: input.actorId,
      body: input.note.trim()
    });
  }

  const updated = await updateAdminRecord(
    "contact_requests",
    "id",
    contactRequestId,
    {
      ...(input.nextStatus ? { status: input.nextStatus } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
      payload: { ...payload, timeline, notes },
      updated_at: now,
      ...(input.patch ?? {})
    },
    input.actorId,
    env,
    { expectedUpdatedAt }
  );

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: `contact_requests.${input.timelineAction}`,
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: { next_status: input.nextStatus ?? text(record.status) }
    },
    input.actorId,
    env
  ).catch(() => undefined);

  return { record, updated };
}

function mapContactRequestRow(row: JsonRecord): AdminContactRequestRow {
  const payload = readPayload(row.payload);
  const requestNumber = typeof row.request_number === "number"
    ? row.request_number
    : Number(row.request_number);
  const productName = text(payload.product_name) || text(payload.item_summary) || null;
  const relatedProductSlug = text(payload.related_product_slug) || text(payload.product_id) || null;

  return {
    id: text(row.id),
    request_number: Number.isFinite(requestNumber) && requestNumber > 0 ? requestNumber : null,
    customer_user_id: text(row.customer_user_id) || null,
    customer_email: text(row.customer_email),
    customer_full_name: text(row.customer_full_name) || text(payload.customer_full_name),
    customer_company: text(row.customer_company) || text(payload.customer_company),
    customer_phone: text(row.customer_phone) || text(payload.customer_phone),
    subject: text(row.subject),
    body: text(row.body),
    status: text(row.status, "new"),
    source: normalizeContactRequestLeadSource(payload.source),
    product_name: productName,
    related_product_slug: relatedProductSlug,
    region: text(row.region) || text(payload.region) || null,
    assigned_to: text(row.assigned_to) || null,
    converted_order_id: text(row.converted_order_id) || null,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    archived_at: text(row.archived_at) || null,
    deleted_at: text(row.deleted_at) || null,
    payload,
    timeline: readTimeline(payload),
    notes: readNotes(payload)
  };
}

function leadSourceSummary(source: ContactRequestLeadSource) {
  if (source === "product_enquiry") return "Product enquiry submitted.";
  if (source === "buy_now") return "Buy Now lead captured.";
  if (source === "checkout") return "Checkout lead captured.";
  return "Consultation request submitted.";
}

function leadNotificationTitle(source: ContactRequestLeadSource) {
  if (source === "product_enquiry") return "New product enquiry lead";
  if (source === "buy_now") return "New Buy Now lead";
  if (source === "checkout") return "New checkout lead";
  return "New contact request";
}

async function findContactRequestByIdempotencyKey(idempotencyKey: string, env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/contact_requests?select=id,request_number,customer_email,customer_phone,customer_full_name,customer_company,subject,body,status,assigned_to,converted_order_id,payload,archived_at,deleted_at,created_at,updated_at&payload->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&deleted_at=is.null&order=created_at.desc&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as JsonRecord[];
  return rows[0] ?? null;
}

export async function submitContactRequest(
  input: ContactRequestInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const source = normalizeContactRequestLeadSource(input.source ?? "contact");
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findContactRequestByIdempotencyKey(idempotencyKey, env);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const productName = input.productName?.trim() || null;
  const relatedProductSlug = input.relatedProductSlug?.trim() || null;
  const record = await createAdminRecord(
    "contact_requests",
    {
      customer_user_id: input.customerUserId ?? null,
      customer_email: input.customerEmail.trim(),
      customer_phone: input.customerPhone.trim(),
      customer_full_name: input.customerFullName.trim(),
      ...(input.customerCompany?.trim() ? { customer_company: input.customerCompany.trim() } : {}),
      subject: input.subject.trim(),
      body: input.body.trim(),
      region: input.region ?? null,
      status: "new",
      payload: {
        source,
        ...(productName ? { product_name: productName } : {}),
        ...(relatedProductSlug ? { related_product_slug: relatedProductSlug, product_id: relatedProductSlug } : {}),
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
        timeline: [{
          at: now,
          action: "submitted",
          actor_id: actorId,
          summary: leadSourceSummary(source),
          status: "new"
        }],
        notes: []
      }
    },
    actorId,
    env,
    {
      ...contactMutationOptions(),
      auditMetadata: {
        writer: actorId ? "user" : "system",
        requester_user_id: input.customerUserId ?? null,
        requester_email: input.customerEmail.trim(),
        requester_phone: input.customerPhone.trim(),
        requester_source: source
      }
    }
  );

  const contactRequestId = text(record.id);
  const requestNumber = typeof record.request_number === "number"
    ? record.request_number
    : Number(record.request_number);
  const reference = formatContactRequestReference(requestNumber);

  if (contactRequestId && Number.isFinite(requestNumber) && requestNumber > 0) {
    await updateAdminRecord(
      "contact_requests",
      "id",
      contactRequestId,
      { subject: `${reference} · ${input.subject.trim()}` },
      actorId,
      env,
      contactMutationOptions()
    ).catch(() => undefined);
    record.subject = `${reference} · ${input.subject.trim()}`;
  }

  if (contactRequestId) {
    await notifyAdminsAboutContactRequest(
      {
        contactRequestId,
        title: leadNotificationTitle(source),
        body: `${input.customerEmail.trim()} submitted ${reference}: ${input.subject.trim()}`,
        actorId
      },
      env
    );
  }

  return record;
}

export async function listAdminContactRequests(env: EnvSource = process.env): Promise<AdminContactRequestRow[]> {
  const config = assertSupabaseAdminConfig(env);
  const cutoff = operationalArchiveHotCutoffIso();
  const selectFields =
    "id,request_number,customer_user_id,customer_email,customer_phone,customer_full_name,customer_company,subject,body,status,region,assigned_to,converted_order_id,payload,archived_at,deleted_at,created_at,updated_at";

  // Fetch recent records (within retention window) and open leads older than the cutoff in parallel.
  // This ensures operators never lose sight of an unresolved contact request just because it's old.
  const [recentResponse, openOldResponse] = await Promise.all([
    fetch(
      `${config.url}/rest/v1/contact_requests?select=${selectFields}&deleted_at=is.null&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc&limit=100`,
      { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
    ),
    fetch(
      `${config.url}/rest/v1/contact_requests?select=${selectFields}&deleted_at=is.null&archived_at=is.null&created_at=lt.${encodeURIComponent(cutoff)}&status=in.(new,contacted,in_progress)&order=created_at.desc&limit=50`,
      { headers: headers(config.serviceRoleKey), cache: "no-store", signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS) }
    )
  ]);

  const recentRows = recentResponse.ok ? ((await recentResponse.json()) as JsonRecord[]) : [];
  const openOldRows = openOldResponse.ok ? ((await openOldResponse.json()) as JsonRecord[]) : [];

  // Dedupe by id (recent takes precedence since it's fresher).
  const seenIds = new Set<string>(recentRows.map((row) => String(row.id ?? "")));
  const merged = [
    ...recentRows,
    ...openOldRows.filter((row) => !seenIds.has(String(row.id ?? "")))
  ];
  merged.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  return merged.map(mapContactRequestRow);
}

export async function markContactRequestContacted(
  contactRequestId: string,
  actorId: string,
  assignedTo: string | null = actorId,
  note?: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const result = await persistContactRequestUpdate(
    contactRequestId,
    {
      actorId,
      nextStatus: "contacted",
      assignedTo: assignedTo ?? actorId,
      note,
      timelineAction: "contacted",
      timelineSummary: "Admin marked the contact request as contacted.",
      expectedUpdatedAt: options.expectedUpdatedAt
    },
    env
  );
  return result.updated;
}

export async function markContactRequestInProgress(
  contactRequestId: string,
  actorId: string,
  note?: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const result = await persistContactRequestUpdate(
    contactRequestId,
    {
      actorId,
      nextStatus: "qualified",
      note,
      timelineAction: "in_progress",
      timelineSummary: note?.trim() || "Contact request marked as in progress.",
      expectedUpdatedAt: options.expectedUpdatedAt
    },
    env
  );
  return result.updated;
}

export async function requestContactRequestMissingInfo(
  contactRequestId: string,
  actorId: string,
  note?: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const record = await loadContactRequest(contactRequestId, env);
  const payload = readPayload(record.payload);
  const timeline = readTimeline(payload);
  const notes = readNotes(payload);
  const now = new Date().toISOString();
  const expectedUpdatedAt = options.expectedUpdatedAt ?? (text(record.updated_at) || null);
  const row = mapContactRequestRow(record);
  const { contactRequestMissingShippingAddressSummary } = await import("@/lib/contact-requests/shared");
  const missingSummary = contactRequestMissingShippingAddressSummary(row);
  const message = note?.trim()
    || (missingSummary
      ? `Missing shipping address noted. Missing: ${missingSummary}.`
      : "Missing shipping address noted. Fill it in via the address editor to continue.");

  timeline.unshift({
    at: now,
    action: "info_requested",
    actor_id: actorId,
    summary: message,
    status: text(record.status, "new")
  });

  if (note?.trim()) {
    notes.unshift({
      id: crypto.randomUUID(),
      at: now,
      actor_id: actorId,
      body: note.trim()
    });
  }

  const updated = await updateAdminRecord(
    "contact_requests",
    "id",
    contactRequestId,
    {
      payload: { ...payload, timeline, notes },
      updated_at: now
    },
    actorId,
    env,
    { expectedUpdatedAt }
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "contact_requests.info_requested",
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: { missing_summary: missingSummary }
    },
    actorId,
    env
  ).catch(() => undefined);

  return updated;
}

export type ContactRequestAddressInput = {
  line1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type UpdateContactRequestAddressInput = {
  shipping: ContactRequestAddressInput;
  billing?: ContactRequestAddressInput | null;
  billingSameAsShipping: boolean;
};

function toStoredContactRequestAddress(address: ContactRequestAddressInput) {
  return {
    line1: address.line1.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    country: address.country.trim(),
    postal_code: address.postalCode.trim()
  };
}

export async function updateContactRequestAddress(
  contactRequestId: string,
  actorId: string,
  address: UpdateContactRequestAddressInput,
  env: EnvSource = process.env
) {
  const {
    getMissingContactRequestAddressFields,
    formatMissingContactRequestAddressLabels
  } = await import("@/lib/contact-requests/shared");

  const shipping = toStoredContactRequestAddress(address.shipping);
  const shippingMissing = getMissingContactRequestAddressFields({
    line1: address.shipping.line1,
    city: address.shipping.city,
    state: address.shipping.state,
    country: address.shipping.country,
    postalCode: address.shipping.postalCode
  });
  if (shippingMissing.length) {
    throw new Error(
      `Missing shipping fields: ${formatMissingContactRequestAddressLabels(shippingMissing)}.`
    );
  }

  const billingSameAsShipping = Boolean(address.billingSameAsShipping);
  const billing = billingSameAsShipping
    ? shipping
    : address.billing
      ? toStoredContactRequestAddress(address.billing)
      : null;

  if (!billingSameAsShipping && address.billing) {
    const billingMissing = getMissingContactRequestAddressFields({
      line1: address.billing.line1,
      city: address.billing.city,
      state: address.billing.state,
      country: address.billing.country,
      postalCode: address.billing.postalCode
    });
    if (billingMissing.length) {
      throw new Error(
        `Missing billing fields: ${formatMissingContactRequestAddressLabels(billingMissing)}. Or mark billing same as shipping.`
      );
    }
  } else if (!billingSameAsShipping) {
    throw new Error("Complete billing address is required, or mark billing same as shipping.");
  }

  const record = await loadContactRequest(contactRequestId, env);
  const payload = readPayload(record.payload);
  const timeline = readTimeline(payload);
  const notes = readNotes(payload);
  const now = new Date().toISOString();

  timeline.unshift({
    at: now,
    action: "address_updated",
    actor_id: actorId,
    summary: "Admin added/updated the customer's address.",
    status: text(record.status, "new")
  });

  const updated = await updateAdminRecord(
    "contact_requests",
    "id",
    contactRequestId,
    {
      updated_at: now,
      payload: {
        ...payload,
        shipping_address: shipping,
        billing_address: billing ?? shipping,
        billing_same_as_shipping: billingSameAsShipping,
        timeline,
        notes
      }
    },
    actorId,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "contact_requests.address_updated",
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: { billing_same_as_shipping: billingSameAsShipping }
    },
    actorId,
    env
  ).catch(() => undefined);

  return updated;
}

export async function archiveContactRequest(
  contactRequestId: string,
  actorId: string,
  note?: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const result = await persistContactRequestUpdate(
    contactRequestId,
    {
      actorId,
      nextStatus: "archived",
      note,
      timelineAction: "archived",
      timelineSummary: note?.trim() || "Contact request archived.",
      patch: { archived_at: new Date().toISOString() },
      expectedUpdatedAt: options.expectedUpdatedAt
    },
    env
  );
  return result.updated;
}

export async function rejectContactRequest(
  contactRequestId: string,
  actorId: string,
  note?: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const result = await persistContactRequestUpdate(
    contactRequestId,
    {
      actorId,
      nextStatus: "rejected",
      note,
      timelineAction: "rejected",
      timelineSummary: note?.trim() || "Contact request rejected.",
      expectedUpdatedAt: options.expectedUpdatedAt
    },
    env
  );
  return result.updated;
}

export async function restoreContactRequest(
  contactRequestId: string,
  actorId: string,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  const result = await persistContactRequestUpdate(
    contactRequestId,
    {
      actorId,
      nextStatus: "new",
      timelineAction: "restored",
      timelineSummary: "Contact request restored.",
      patch: { archived_at: null, deleted_at: null },
      expectedUpdatedAt: options.expectedUpdatedAt
    },
    env
  );
  return result.updated;
}

export type PromoteContactRequestToOrderResult = {
  order_id: string;
  order_number: string | null;
  status: string;
  idempotent?: boolean;
};

export type UpdateContactRequestContactDetailsInput = {
  fullName: string;
  phone: string;
  company?: string;
};

export async function updateContactRequestContactDetails(
  contactRequestId: string,
  actorId: string,
  details: UpdateContactRequestContactDetailsInput,
  env: EnvSource = process.env
) {
  const record = await loadContactRequest(contactRequestId, env);
  const payload = readPayload(record.payload);
  const timeline = readTimeline(payload);
  const notes = readNotes(payload);
  const now = new Date().toISOString();
  const fullName = details.fullName.trim();
  const phone = details.phone.trim();
  const company = details.company?.trim() ?? "";

  timeline.unshift({
    at: now,
    action: "details_updated",
    actor_id: actorId,
    summary: "Admin updated customer contact details.",
    status: text(record.status, "new")
  });

  const updated = await updateAdminRecord(
    "contact_requests",
    "id",
    contactRequestId,
    {
      customer_full_name: fullName,
      customer_phone: phone,
      customer_company: company || null,
      updated_at: now,
      payload: {
        ...payload,
        customer_full_name: fullName,
        customer_phone: phone,
        ...(company ? { customer_company: company } : {}),
        timeline,
        notes
      }
    },
    actorId,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "contact_requests.details_updated",
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: { has_phone: Boolean(phone), has_company: Boolean(company) }
    },
    actorId,
    env
  ).catch(() => undefined);

  return updated;
}

async function enrichContactRequestOrderWithItems(
  orderId: string,
  contactRequestId: string,
  actorId: string,
  lineItems: ConversionLineItem[],
  env: EnvSource
) {
  const record = await loadContactRequest(contactRequestId, env);
  const payload = readPayload(record.payload);
  const stockItems = await resolveCheckoutStockSkus(lineItems, env);
  const { getCheckoutPricingBySlugs } = await import("@/services/catalog");
  const catalog = await getCheckoutPricingBySlugs(stockItems.map((item) => item.productSlug));

  const draft = buildValidatedOrderDraft(
    {
      customerEmail: text(record.customer_email),
      phone: text(record.customer_phone) || undefined,
      region: text(record.region) || undefined,
      items: stockItems.map((item) => ({
        productSlug: item.productSlug,
        quantity: item.quantity,
        sku: item.sku ?? undefined
      })),
      metadata: readPayload((await fetchAdminRecordsByColumn("orders", "id", orderId, env))[0]?.metadata)
    },
    catalog
  );

  const now = new Date().toISOString();
  for (const item of draft.orderItems) {
    await createAdminRecord(
      "order_items",
      {
        order_id: orderId,
        product_slug: item.product_slug,
        product_name: item.product_name,
        bundle_id: item.bundle_id,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        metadata: item.metadata,
        updated_at: now
      },
      actorId,
      env
    );
  }

  const orderRows = await fetchAdminRecordsByColumn("orders", "id", orderId, env);
  const order = orderRows[0];
  const metadata = readPayload(order?.metadata);
  const itemsJson = draft.orderItems.map((item) => ({
    product_slug: item.product_slug,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
    sku: item.sku
  }));

  await updateAdminRecord(
    "orders",
    "id",
    orderId,
    {
      subtotal: draft.order.subtotal,
      total: draft.order.total,
      items: itemsJson,
      metadata: {
        ...metadata,
        needs_products: false,
        ...(payload.shipping_address ? { shipping_address: payload.shipping_address } : {})
      },
      updated_at: now
    },
    actorId,
    env
  );
}

export async function promoteContactRequestToOrder(
  contactRequestId: string,
  actorId: string,
  env: EnvSource = process.env,
  overrideItems?: ConversionLineItem[]
): Promise<PromoteContactRequestToOrderResult> {
  const existing = await loadContactRequest(contactRequestId, env);
  const existingStatus = text(existing.status, "new");
  const alreadyLinked = Boolean(text(existing.converted_order_id));

  // Defense in depth: RPC also rejects closed requests under row lock.
  if (
    !alreadyLinked &&
    (existingStatus === "rejected" || existingStatus === "archived" || Boolean(existing.archived_at))
  ) {
    throw new Error("This contact request is closed and cannot be converted to an order.");
  }

  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/rpc/convert_contact_request_to_order`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
    body: JSON.stringify({
      p_contact_request_id: contactRequestId,
      p_actor_id: actorId
    })
  });

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Failed to convert contact request to order: ${response.status}${body ? ` - ${body.slice(0, 240)}` : ""}`);
  }

  const result = body ? JSON.parse(body) as JsonRecord : {};
  if (result.ok !== true) {
    const errorCode = text(result.error, "Failed to convert contact request to order.");
    if (errorCode === "contact_request_closed") {
      throw new Error("This contact request is closed and cannot be converted to an order.");
    }
    throw new Error(errorCode);
  }

  const orderId = text(result.order_id);
  if (!orderId) throw new Error("Converted order id was not returned.");

  if (overrideItems?.length && result.idempotent !== true) {
    await enrichContactRequestOrderWithItems(orderId, contactRequestId, actorId, overrideItems, env);
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "contact_requests.converted_to_order",
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: {
        order_id: orderId,
        order_number: text(result.order_number) || null,
        idempotent: result.idempotent === true
      }
    },
    actorId,
    env
  ).catch(() => undefined);

  // Sync sibling enquiry (if any) so its Convert action is no longer offered.
  if (orderId && result.idempotent !== true) {
    try {
      const payload = existing.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
        ? existing.payload as Record<string, unknown>
        : {};
      const idempotencyKey = text(payload.idempotency_key);
      if (idempotencyKey) {
        await syncSiblingEnquiryConverted(idempotencyKey, orderId, env, config);
      }
    } catch {
      // Best-effort; do not fail the convert if sibling sync fails.
    }
  }

  return {
    order_id: orderId,
    order_number: text(result.order_number) || null,
    status: text(result.status, "draft"),
    idempotent: result.idempotent === true
  };
}

async function syncSiblingEnquiryConverted(
  idempotencyKey: string,
  orderId: string,
  env: EnvSource,
  config: { url: string; serviceRoleKey: string }
) {
  const now = new Date().toISOString();
  const response = await fetch(
    `${config.url}/rest/v1/enquiries?payload->>idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&deleted_at=is.null&converted_order_id=is.null&limit=5`,
    { method: "GET", headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return;
  const rows = (await response.json()) as JsonRecord[];
  for (const row of rows) {
    const id = text(row.id);
    if (!id) continue;
    await fetch(
      `${config.url}/rest/v1/enquiries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...headers(config.serviceRoleKey), Prefer: "return=minimal" },
        body: JSON.stringify({ status: "converted", converted_order_id: orderId, updated_at: now }),
        cache: "no-store"
      }
    );
  }
  void env; // reserved
}

export async function linkContactRequestToOrder(
  contactRequestId: string,
  orderId: string,
  actorId: string,
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/rpc/link_contact_request_to_order`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
    body: JSON.stringify({
      p_contact_request_id: contactRequestId,
      p_order_id: orderId,
      p_actor_id: actorId
    })
  });

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Failed to link contact request to order: ${response.status}${body ? ` - ${body.slice(0, 240)}` : ""}`);
  }

  const result = body ? JSON.parse(body) as JsonRecord : {};
  if (result.ok !== true) {
    throw new Error(text(result.error, "Failed to link contact request to order."));
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "contact_requests.linked_to_order",
      entity_table: "contact_requests",
      entity_id: contactRequestId,
      severity: "info",
      metadata: { order_id: orderId }
    },
    actorId,
    env
  ).catch(() => undefined);

  return result;
}
