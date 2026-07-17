import { guardExportRoute } from "@/lib/auth/export-route-auth";
import {
  ARCHIVE_SLUG_ENTITIES,
  type ArchiveExportSlug,
  exportArchiveEntityCsvBySlug
} from "@/services/data-archive";

export const dynamic = "force-dynamic";

const validSlugs = new Set(Object.keys(ARCHIVE_SLUG_ENTITIES));

type RouteContext = { params: Promise<{ entity: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const denied = await guardExportRoute("audit.read");
  if (denied) return denied;

  const { entity } = await context.params;
  if (!validSlugs.has(entity)) {
    return new Response("Invalid archive export entity.", { status: 400 });
  }

  const { csv, fileName, rowCount } = await exportArchiveEntityCsvBySlug(entity as ArchiveExportSlug);
  if (!rowCount) {
    return new Response("No archived rows available for this export yet.", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Archive-Row-Count": String(rowCount)
    }
  });
}
