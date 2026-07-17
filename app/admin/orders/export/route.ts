import { guardExportRoute } from "@/lib/auth/export-route-auth";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { exportOrdersCsv, parseOrdersExportSearchParams } from "@/services/orders-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardExportRoute("orders.write");
  if (denied) return denied;

  const url = new URL(request.url);
  const policy = await getAdminSettingsPolicy();
  const input = parseOrdersExportSearchParams(url.searchParams);
  const { csv, fileName } = await exportOrdersCsv({
    ...input,
    defaultWarehouseCode: input.defaultWarehouseCode || policy.defaultWarehouseCode
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`
    }
  });
}
