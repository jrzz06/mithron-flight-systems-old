import { getAdminNavMetricsPayload } from "@/services/nav-metrics";
import {
  getWarehouseSnapshot,
  getProductManagerSnapshot
} from "@/services/admin";
import { getCsvInventoryRows } from "@/services/csv-inventory-source";
import { listAdminLeads } from "@/services/leads";
import { listActiveWarehouses } from "@/services/warehouses";
import { getUserGovernanceSnapshot, getAdminSuppliersSnapshot, getAuditObservabilitySnapshot } from "@/services/admin";
import type { AdminLiveResourceId } from "@/lib/admin/realtime/admin-entity-store";
import type { AdminLiveResourcePayload } from "@/lib/admin/realtime/admin-resource-registry";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

function asRows(value: unknown): AdminEntityRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is AdminEntityRow => Boolean(row) && typeof row === "object");
}

export async function loadAdminLiveResource(resource: AdminLiveResourceId): Promise<AdminLiveResourcePayload> {
  const generatedAt = new Date().toISOString();

  switch (resource) {
    case "nav_metrics": {
      const metrics = await getAdminNavMetricsPayload();
      return { resource, generatedAt, data: { ...metrics } };
    }
    case "dashboard": {
      const [metrics, snapshot] = await Promise.all([
        getAdminNavMetricsPayload(),
        getWarehouseSnapshot({ scope: "orders" })
      ]);
      return {
        resource,
        generatedAt,
        data: {
          ...metrics,
          orders: asRows(snapshot.data.orders),
          inventory: asRows(snapshot.data.inventory)
        }
      };
    }
    case "orders": {
      const snapshot = await getWarehouseSnapshot({ scope: "orders" });
      return {
        resource,
        generatedAt,
        data: {
          orders: asRows(snapshot.data.orders),
          order_items: asRows(snapshot.data.orderItems),
          inventory: asRows(snapshot.data.inventory),
          shipments: asRows(snapshot.data.shipments),
          mithron_products: asRows(snapshot.data.products)
        }
      };
    }
    case "inventory": {
      const result = await getCsvInventoryRows({ all: true }).catch(() => ({ rows: [] as AdminEntityRow[] }));
      return {
        resource,
        generatedAt,
        data: {
          inventory: asRows(result.rows)
        }
      };
    }
    case "products": {
      const snapshot = await getProductManagerSnapshot().catch(() => ({
        data: {
          products: [],
          inventory: [],
          stock: [],
          mediaLinks: []
        }
      }));
      return {
        resource,
        generatedAt,
        data: {
          mithron_products: asRows(snapshot.data.products),
          inventory: asRows(snapshot.data.inventory),
          warehouse_stock: asRows(snapshot.data.stock),
          product_media_assets: asRows(snapshot.data.mediaLinks)
        }
      };
    }
    case "enquiries": {
      const leads = await listAdminLeads({ status: "all" }).catch(() => []);
      return { resource, generatedAt, data: { enquiries: asRows(leads), leads: asRows(leads) } };
    }
    case "contact_requests": {
      const leads = await listAdminLeads({ status: "all" }).catch(() => []);
      return { resource, generatedAt, data: { contact_requests: asRows(leads), leads: asRows(leads) } };
    }
    case "suppliers": {
      const snapshot = await getAdminSuppliersSnapshot().catch(() => ({ data: { suppliers: [] } }));
      return {
        resource,
        generatedAt,
        data: {
          suppliers: asRows(snapshot.data.suppliers as unknown as AdminEntityRow[])
        }
      };
    }
    case "users": {
      const snapshot = await getUserGovernanceSnapshot().catch(() => ({
        data: { users: [], invites: [], activity: [], roles: [] }
      }));
      return {
        resource,
        generatedAt,
        data: {
          profiles: asRows(snapshot.data.users),
          admin_invites: asRows(snapshot.data.invites),
          activity_logs: asRows(snapshot.data.activity),
          roles: asRows(snapshot.data.roles)
        }
      };
    }
    case "warehouses": {
      const warehouses = await listActiveWarehouses().catch(() => []);
      return { resource, generatedAt, data: { warehouses: asRows(warehouses) } };
    }
    case "audit": {
      const snapshot = await getAuditObservabilitySnapshot().catch(() => ({
        data: {
          securityEvents: [],
          authEvents: [],
          deniedActions: [],
          activityLogs: [],
          auditLogs: []
        }
      }));
      return {
        resource,
        generatedAt,
        data: {
          security_events: asRows(snapshot.data.securityEvents),
          activity_logs: asRows(snapshot.data.activityLogs ?? snapshot.data.authEvents),
          audit_logs: asRows(snapshot.data.auditLogs ?? [])
        }
      };
    }
    case "archives": {
      return { resource, generatedAt, data: { data_archive_runs: [] } };
    }
    default:
      return { resource, generatedAt, data: {} };
  }
}
