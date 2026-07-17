import { getCsvInventoryRows } from "@/services/csv-inventory-source";
import { buildInventoryExportCsv } from "@/services/inventory-csv";
import { guardExportRoute } from "@/lib/auth/export-route-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardExportRoute("warehouse.write");
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const catalog = url.searchParams.get("catalog");
  const catalogFilter = catalog === "archived" || catalog === "all" || catalog === "active" ? catalog : "all";
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const inventorySource = await getCsvInventoryRows({ all: true, catalogFilter });
  const rows = inventorySource.rows
    .filter((row) => status === "all" || row.stockStatus === status)
    .filter((row) => query ? `${row.productName} ${row.sku} ${row.category}`.toLowerCase().includes(query) : true);
  const csv = buildInventoryExportCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mithron-inventory-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
