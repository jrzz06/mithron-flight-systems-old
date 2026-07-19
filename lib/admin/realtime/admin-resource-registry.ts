import type { AdminEntityRow, AdminLiveResourceId } from "@/lib/admin/realtime/admin-entity-store";

export type AdminLiveResourcePayload = {
  resource: AdminLiveResourceId;
  generatedAt: string;
  data: Record<string, AdminEntityRow[] | AdminEntityRow | number | string | boolean | null>;
};

export const ADMIN_LIVE_RESOURCES = [
  "orders",
  "inventory",
  "products",
  "enquiries",
  "contact_requests",
  "suppliers",
  "users",
  "warehouses",
  "audit",
  "archives",
  "dashboard",
  "nav_metrics"
] as const satisfies readonly AdminLiveResourceId[];

export function isAdminLiveResourceId(value: string): value is AdminLiveResourceId {
  return (ADMIN_LIVE_RESOURCES as readonly string[]).includes(value);
}
