import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type LinkedOrderSummary = {
  id: string;
  order_number: string | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  updated_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
};

type EnvSource = Record<string, string | undefined>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

export async function loadLinkedOrderSummaries(
  orderIds: string[],
  env: EnvSource = process.env
): Promise<Record<string, LinkedOrderSummary>> {
  const uniqueIds = Array.from(new Set(orderIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniqueIds.length) return {};

  const config = assertSupabaseAdminConfig(env);
  const filter = uniqueIds.map((id) => encodeURIComponent(id)).join(",");
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,status,payment_status,fulfillment_status,updated_at,archived_at,deleted_at,metadata&id=in.(${filter})`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return {};

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const map: Record<string, LinkedOrderSummary> = {};
  for (const row of rows) {
    const id = text(row.id);
    if (!id) continue;
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    map[id] = {
      id,
      order_number: text(row.order_number) || null,
      status: text(row.status),
      payment_status: text(row.payment_status),
      fulfillment_status: text(row.fulfillment_status, "pending"),
      updated_at: text(row.updated_at) || null,
      archived_at: text(row.archived_at) || null,
      deleted_at: text(row.deleted_at) || null,
      metadata
    };
  }
  return map;
}
