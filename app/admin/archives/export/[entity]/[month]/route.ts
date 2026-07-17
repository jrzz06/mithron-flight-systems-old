import {
  ARCHIVE_SLUG_ENTITIES,
  ARCHIVE_STORAGE_BUCKET,
  archiveCsvStoragePath,
  downloadArchiveCsvFromStorage,
  exportArchiveEntityCsvBySlug,
  type ArchiveExportSlug
} from "@/services/data-archive";
import { guardExportRoute } from "@/lib/auth/export-route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ entity: string; month: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const denied = await guardExportRoute("audit.read");
  if (denied) return denied;

  const { entity: entitySlug, month } = await context.params;
  if (!Object.prototype.hasOwnProperty.call(ARCHIVE_SLUG_ENTITIES, entitySlug) || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response("Invalid archive export path.", { status: 400 });
  }

  const storagePath = archiveCsvStoragePath(ARCHIVE_SLUG_ENTITIES[entitySlug as ArchiveExportSlug], month);
  let csv = await downloadArchiveCsvFromStorage(storagePath);
  let fileName = storagePath.split("/").pop() ?? `${entitySlug}.csv`;

  if (!csv) {
    const liveExport = await exportArchiveEntityCsvBySlug(entitySlug as ArchiveExportSlug);
    if (!liveExport.rowCount) {
      return new Response("Archive CSV not found.", { status: 404 });
    }
    csv = liveExport.csv;
    fileName = liveExport.fileName;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Archive-Bucket": ARCHIVE_STORAGE_BUCKET
    }
  });
}
