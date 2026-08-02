import { guardExportRoute } from "@/lib/auth/export-route-auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import { exportWarehouseDashboardCsv } from "@/services/warehouse-ops-queries";
import { resolveWarehouseScope } from "@/services/warehouse-scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guardExportRoute("orders.write");
  if (denied) return denied;

  const auth = await getCurrentAuthContext();
  const [policy, scope] = await Promise.all([
    getAdminSettingsPolicy(),
    resolveWarehouseScope({ userId: auth.userId, role: auth.role })
  ]);

  const { csv, fileName, available, blockedReason } = await exportWarehouseDashboardCsv({
    scope,
    defaultWarehouseCode: policy.defaultWarehouseCode
  });

  if (!available) {
    return Response.json(
      { error: blockedReason || "Dashboard export is temporarily unavailable." },
      { status: 503 }
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`
    }
  });
}
