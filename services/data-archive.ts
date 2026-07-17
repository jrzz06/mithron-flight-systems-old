import { assertSupabaseAdminConfig } from "@/lib/env";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export const ARCHIVE_STORAGE_BUCKET = "mithron-data-archives";
export const DEFAULT_ARCHIVE_RETENTION_DAYS = 30;
export const MIN_ARCHIVE_RETENTION_DAYS = 7;
export const MAX_ARCHIVE_RETENTION_DAYS = 365;
export const ARCHIVE_EXPORT_MAX_ROWS = 10_000;

export type ArchiveEntity =
  | "orders"
  | "enquiries"
  | "contact_requests"
  | "activity_logs"
  | "audit_logs";

export type ArchiveExportSlug =
  | "orders"
  | "enquiries"
  | "contact-requests"
  | "activity-logs"
  | "audit-logs";

export const ARCHIVE_ENTITY_SLUGS: Record<ArchiveEntity, ArchiveExportSlug> = {
  orders: "orders",
  enquiries: "enquiries",
  contact_requests: "contact-requests",
  activity_logs: "activity-logs",
  audit_logs: "audit-logs"
};

export const ARCHIVE_SLUG_ENTITIES: Record<ArchiveExportSlug, ArchiveEntity> = {
  orders: "orders",
  enquiries: "enquiries",
  "contact-requests": "contact_requests",
  "activity-logs": "activity_logs",
  "audit-logs": "audit_logs"
};

export type ArchiveOperationalResult = {
  cutoff: string;
  runStarted: string;
  retentionDays: number;
  ordersArchived: number;
  orderItemsArchived: number;
  enquiriesArchived: number;
  contactRequestsArchived: number;
  activityLogsArchived: number;
  auditLogsArchived: number;
};

export type DataArchiveRunRow = {
  id: string;
  run_month: string;
  entity: string;
  rows_archived: number;
  csv_storage_path: string | null;
  status: string;
  metadata: JsonRecord;
  created_at: string;
};

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function encodeObjectPath(storagePath: string) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export function resolveArchiveRetentionDays(env: EnvSource = process.env) {
  const parsed = Number(env.OPERATIONAL_ARCHIVE_RETENTION_DAYS ?? DEFAULT_ARCHIVE_RETENTION_DAYS);
  if (!Number.isInteger(parsed)) return DEFAULT_ARCHIVE_RETENTION_DAYS;
  return Math.min(MAX_ARCHIVE_RETENTION_DAYS, Math.max(MIN_ARCHIVE_RETENTION_DAYS, parsed));
}

export function operationalArchiveHotCutoffIso(retentionDays = DEFAULT_ARCHIVE_RETENTION_DAYS) {
  const days = Math.min(MAX_ARCHIVE_RETENTION_DAYS, Math.max(MIN_ARCHIVE_RETENTION_DAYS, retentionDays));
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function archiveMonthLabel(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function archiveCsvStoragePath(entity: ArchiveEntity, monthLabel = archiveMonthLabel()) {
  const fileName =
    entity === "contact_requests" ? "contact-requests.csv"
    : entity === "activity_logs" ? "activity-logs.csv"
    : entity === "audit_logs" ? "audit-logs.csv"
    : `${entity}.csv`;
  return `archives/${monthLabel}/${fileName}`;
}

export function archiveExportFileName(entity: ArchiveEntity, date = new Date()) {
  const slug = ARCHIVE_ENTITY_SLUGS[entity];
  return `mithron-archived-${slug}-${date.toISOString().slice(0, 10)}.csv`;
}

export function archiveSerializeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function buildArchiveCsvDocument(headerRow: string[], dataRows: unknown[][]): string {
  const headerLine = headerRow.map(archiveSerializeCell).join(",");
  const bodyLines = dataRows.map((row) => row.map(archiveSerializeCell).join(","));
  return `\uFEFF${[headerLine, ...bodyLines].join("\r\n")}`;
}

function formatArchiveTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString();
}

function parseArchiveRpcResult(raw: unknown): ArchiveOperationalResult {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JsonRecord : {};
  return {
    cutoff: String(record.cutoff ?? ""),
    runStarted: String(record.run_started ?? ""),
    retentionDays: Number(record.retention_days ?? DEFAULT_ARCHIVE_RETENTION_DAYS),
    ordersArchived: Number(record.orders_archived ?? 0),
    orderItemsArchived: Number(record.order_items_archived ?? 0),
    enquiriesArchived: Number(record.enquiries_archived ?? 0),
    contactRequestsArchived: Number(record.contact_requests_archived ?? 0),
    activityLogsArchived: Number(record.activity_logs_archived ?? 0),
    auditLogsArchived: Number(record.audit_logs_archived ?? 0)
  };
}

export async function invokeArchiveOperationalData(
  retentionDays: number,
  env: EnvSource = process.env
): Promise<ArchiveOperationalResult> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/rpc/archive_operational_data`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    body: JSON.stringify({ retention_days: retentionDays }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`archive_operational_data failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return parseArchiveRpcResult(await response.json());
}

async function fetchArchiveRows(
  table: string,
  select: string,
  runStarted: string,
  env: EnvSource
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&archived_at=gte.${encodeURIComponent(runStarted)}&order=created_at.asc&limit=5000`,
    { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store" }
  );
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

function buildCsv(headers: string[], rows: unknown[][]) {
  return buildArchiveCsvDocument(headers, rows);
}

export function buildOrdersArchiveCsv(rows: JsonRecord[]) {
  return buildCsv(
    [
      "order_id",
      "order_number",
      "customer_email",
      "status",
      "payment_status",
      "fulfillment_status",
      "channel",
      "subtotal",
      "total",
      "currency",
      "archived_at",
      "created_at",
      "updated_at"
    ],
    rows.map((row) => [
      row.id,
      row.order_number,
      row.customer_email,
      row.status,
      row.payment_status,
      row.fulfillment_status,
      row.channel,
      row.subtotal,
      row.total,
      row.currency,
      formatArchiveTimestamp(row.archived_at),
      formatArchiveTimestamp(row.created_at),
      formatArchiveTimestamp(row.updated_at)
    ])
  );
}

export function buildEnquiriesArchiveCsv(rows: JsonRecord[]) {
  return buildCsv(
    [
      "enquiry_id",
      "enquiry_number",
      "customer_email",
      "subject",
      "body",
      "status",
      "enquiry_kind",
      "related_product_slug",
      "converted_order_id",
      "archived_at",
      "created_at",
      "updated_at"
    ],
    rows.map((row) => [
      row.id,
      row.enquiry_number,
      row.customer_email,
      row.subject,
      row.body,
      row.status,
      row.enquiry_kind,
      row.related_product_slug,
      row.converted_order_id,
      formatArchiveTimestamp(row.archived_at),
      formatArchiveTimestamp(row.created_at),
      formatArchiveTimestamp(row.updated_at)
    ])
  );
}

export function buildContactRequestsArchiveCsv(rows: JsonRecord[]) {
  return buildCsv(
    [
      "request_id",
      "request_number",
      "customer_email",
      "customer_phone",
      "customer_full_name",
      "customer_company",
      "subject",
      "body",
      "status",
      "converted_order_id",
      "archived_at",
      "created_at",
      "updated_at"
    ],
    rows.map((row) => [
      row.id,
      row.request_number,
      row.customer_email,
      row.customer_phone,
      row.customer_full_name,
      row.customer_company,
      row.subject,
      row.body,
      row.status,
      row.converted_order_id,
      formatArchiveTimestamp(row.archived_at),
      formatArchiveTimestamp(row.created_at),
      formatArchiveTimestamp(row.updated_at)
    ])
  );
}

export function buildActivityLogsArchiveCsv(rows: JsonRecord[]) {
  return buildCsv(
    [
      "log_id",
      "actor_id",
      "action",
      "entity_table",
      "entity_id",
      "severity",
      "metadata_json",
      "archived_at",
      "created_at"
    ],
    rows.map((row) => [
      row.id,
      row.actor_id,
      row.action,
      row.entity_table,
      row.entity_id,
      row.severity,
      row.metadata,
      formatArchiveTimestamp(row.archived_at),
      formatArchiveTimestamp(row.created_at)
    ])
  );
}

export function buildAuditLogsArchiveCsv(rows: JsonRecord[]) {
  return buildCsv(
    [
      "log_id",
      "actor_id",
      "action",
      "entity_table",
      "entity_id",
      "before_data_json",
      "after_data_json",
      "metadata_json",
      "archived_at",
      "created_at"
    ],
    rows.map((row) => [
      row.id,
      row.actor_id,
      row.action,
      row.entity_table,
      row.entity_id,
      row.before_data,
      row.after_data,
      row.metadata,
      formatArchiveTimestamp(row.archived_at),
      formatArchiveTimestamp(row.created_at)
    ])
  );
}

export async function uploadArchiveCsv(storagePath: string, csv: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const body = new TextEncoder().encode(csv);
  const response = await fetch(
    `${config.url}/storage/v1/object/${ARCHIVE_STORAGE_BUCKET}/${encodeObjectPath(storagePath)}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "text/csv; charset=utf-8",
        "x-upsert": "true"
      },
      body
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Archive CSV upload failed for ${storagePath}: ${response.status} ${text.slice(0, 200)}`);
  }

  return storagePath;
}

export async function recordArchiveRun(
  input: {
    runMonth: string;
    entity: ArchiveEntity;
    rowsArchived: number;
    csvStoragePath?: string | null;
    metadata?: JsonRecord;
  },
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/data_archive_runs`, {
    method: "POST",
    headers: {
      ...headers(config.serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      run_month: input.runMonth,
      entity: input.entity,
      rows_archived: input.rowsArchived,
      csv_storage_path: input.csvStoragePath ?? null,
      status: "completed",
      metadata: input.metadata ?? {}
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to record archive run: ${response.status} ${text.slice(0, 200)}`);
  }

  const rows = (await response.json()) as DataArchiveRunRow[];
  return rows[0] ?? null;
}

type EntityExportConfig = {
  entity: ArchiveEntity;
  table: string;
  select: string;
  count: number;
  buildCsv: (rows: JsonRecord[]) => string;
};

export async function exportArchivedBatchCsvs(
  result: ArchiveOperationalResult,
  env: EnvSource = process.env
) {
  const monthLabel = archiveMonthLabel();
  const runMonth = `${monthLabel}-01`;
  const runStarted = result.runStarted;
  if (!runStarted) return [];

  const configs: EntityExportConfig[] = [
    {
      entity: "orders",
      table: "orders_archive",
      select: "id,order_number,customer_email,status,payment_status,fulfillment_status,channel,subtotal,total,currency,archived_at,created_at,updated_at",
      count: result.ordersArchived,
      buildCsv: buildOrdersArchiveCsv
    },
    {
      entity: "enquiries",
      table: "enquiries_archive",
      select: "id,enquiry_number,customer_email,subject,body,status,enquiry_kind,related_product_slug,converted_order_id,archived_at,created_at,updated_at",
      count: result.enquiriesArchived,
      buildCsv: buildEnquiriesArchiveCsv
    },
    {
      entity: "contact_requests",
      table: "contact_requests_archive",
      select: "id,request_number,customer_email,customer_phone,customer_full_name,customer_company,subject,body,status,converted_order_id,archived_at,created_at,updated_at",
      count: result.contactRequestsArchived,
      buildCsv: buildContactRequestsArchiveCsv
    },
    {
      entity: "activity_logs",
      table: "activity_logs_archive",
      select: "id,actor_id,action,entity_table,entity_id,severity,metadata,archived_at,created_at",
      count: result.activityLogsArchived,
      buildCsv: buildActivityLogsArchiveCsv
    },
    {
      entity: "audit_logs",
      table: "audit_logs_archive",
      select: "id,actor_id,action,entity_table,entity_id,before_data,after_data,metadata,archived_at,created_at",
      count: result.auditLogsArchived,
      buildCsv: buildAuditLogsArchiveCsv
    }
  ];

  const recorded: DataArchiveRunRow[] = [];

  for (const config of configs) {
    const rows = config.count > 0
      ? await fetchArchiveRows(config.table, config.select, runStarted, env)
      : [];

    let csvPath: string | null = null;
    if (rows.length) {
      const storagePath = archiveCsvStoragePath(config.entity, monthLabel);
      await uploadArchiveCsv(storagePath, config.buildCsv(rows), env);
      csvPath = storagePath;
    }

    const run = await recordArchiveRun({
      runMonth,
      entity: config.entity,
      rowsArchived: config.count,
      csvStoragePath: csvPath,
      metadata: { run_started: runStarted, exported_rows: rows.length }
    }, env);

    if (run) recorded.push(run);
  }

  return recorded;
}

export async function runOperationalDataArchive(
  retentionDays: number,
  env: EnvSource = process.env
) {
  const result = await invokeArchiveOperationalData(retentionDays, env);
  const runs = await exportArchivedBatchCsvs(result, env);
  return { result, runs };
}

export async function listDataArchiveRuns(limit = 24, env: EnvSource = process.env): Promise<DataArchiveRunRow[]> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/data_archive_runs?select=id,run_month,entity,rows_archived,csv_storage_path,status,metadata,created_at&order=created_at.desc&limit=${limit}`,
    { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store" }
  );
  if (!response.ok) return [];
  return (await response.json()) as DataArchiveRunRow[];
}

export async function listArchivedOrders(
  input: { limit?: number; offset?: number; query?: string } = {},
  env: EnvSource = process.env
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const query = (input.query ?? "").trim().toLowerCase();
  let url = `${config.url}/rest/v1/orders_archive?select=id,order_number,customer_email,status,payment_status,fulfillment_status,total,currency,archived_at,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (query) {
    url += `&or=(customer_email.ilike.*${encodeURIComponent(query)}*,order_number.ilike.*${encodeURIComponent(query)}*)`;
  }
  const response = await fetch(url, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    cache: "no-store"
  });
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function listArchivedEnquiries(
  input: { limit?: number; offset?: number; query?: string } = {},
  env: EnvSource = process.env
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const query = (input.query ?? "").trim().toLowerCase();
  let url = `${config.url}/rest/v1/enquiries_archive?select=id,enquiry_number,customer_email,subject,status,enquiry_kind,archived_at,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (query) {
    url += `&or=(customer_email.ilike.*${encodeURIComponent(query)}*,subject.ilike.*${encodeURIComponent(query)}*)`;
  }
  const response = await fetch(url, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    cache: "no-store"
  });
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function listArchivedContactRequests(
  input: { limit?: number; offset?: number; query?: string } = {},
  env: EnvSource = process.env
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const query = (input.query ?? "").trim().toLowerCase();
  let url = `${config.url}/rest/v1/contact_requests_archive?select=id,request_number,customer_email,customer_full_name,subject,status,archived_at,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (query) {
    url += `&or=(customer_email.ilike.*${encodeURIComponent(query)}*,subject.ilike.*${encodeURIComponent(query)}*)`;
  }
  const response = await fetch(url, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    cache: "no-store"
  });
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function listArchivedLogs(
  input: { limit?: number; offset?: number; kind?: "activity" | "audit" } = {},
  env: EnvSource = process.env
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const table = input.kind === "audit" ? "audit_logs_archive" : "activity_logs_archive";
  const select = input.kind === "audit"
    ? "id,actor_id,action,entity_table,entity_id,archived_at,created_at"
    : "id,actor_id,action,entity_table,entity_id,severity,archived_at,created_at";
  const response = await fetch(
    `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store" }
  );
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function downloadArchiveCsvFromStorage(
  storagePath: string,
  env: EnvSource = process.env
): Promise<string | null> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/storage/v1/object/${ARCHIVE_STORAGE_BUCKET}/${encodeObjectPath(storagePath)}`,
    { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store" }
  );
  if (!response.ok) return null;
  return response.text();
}

const ARCHIVE_ENTITY_EXPORT_CONFIG: Record<ArchiveEntity, {
  table: string;
  select: string;
  buildCsv: (rows: JsonRecord[]) => string;
}> = {
  orders: {
    table: "orders_archive",
    select: "id,order_number,customer_email,status,payment_status,fulfillment_status,channel,subtotal,total,currency,archived_at,created_at,updated_at",
    buildCsv: buildOrdersArchiveCsv
  },
  enquiries: {
    table: "enquiries_archive",
    select: "id,enquiry_number,customer_email,subject,body,status,enquiry_kind,related_product_slug,converted_order_id,archived_at,created_at,updated_at",
    buildCsv: buildEnquiriesArchiveCsv
  },
  contact_requests: {
    table: "contact_requests_archive",
    select: "id,request_number,customer_email,customer_phone,customer_full_name,customer_company,subject,body,status,converted_order_id,archived_at,created_at,updated_at",
    buildCsv: buildContactRequestsArchiveCsv
  },
  activity_logs: {
    table: "activity_logs_archive",
    select: "id,actor_id,action,entity_table,entity_id,severity,metadata,archived_at,created_at",
    buildCsv: buildActivityLogsArchiveCsv
  },
  audit_logs: {
    table: "audit_logs_archive",
    select: "id,actor_id,action,entity_table,entity_id,before_data,after_data,metadata,archived_at,created_at",
    buildCsv: buildAuditLogsArchiveCsv
  }
};

export async function fetchAllArchivedTableRows(
  table: string,
  select: string,
  env: EnvSource = process.env,
  maxRows = ARCHIVE_EXPORT_MAX_ROWS
): Promise<JsonRecord[]> {
  const config = assertSupabaseAdminConfig(env);
  const pageSize = 1000;
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const response = await fetch(
      `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc&limit=${limit}&offset=${offset}`,
      { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store" }
    );
    if (!response.ok) break;
    const batch = (await response.json()) as JsonRecord[];
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < limit) break;
  }

  return rows;
}

export async function exportArchiveEntityCsv(
  entity: ArchiveEntity,
  env: EnvSource = process.env
) {
  const config = ARCHIVE_ENTITY_EXPORT_CONFIG[entity];
  const rows = await fetchAllArchivedTableRows(config.table, config.select, env);
  return {
    csv: config.buildCsv(rows),
    fileName: archiveExportFileName(entity),
    rowCount: rows.length
  };
}

export async function exportArchiveEntityCsvBySlug(
  slug: ArchiveExportSlug,
  env: EnvSource = process.env
) {
  return exportArchiveEntityCsv(ARCHIVE_SLUG_ENTITIES[slug], env);
}
