import Link from "next/link";
import { ARCHIVE_ENTITY_SLUGS, type ArchiveEntity } from "@/services/data-archive";

type ArchiveDownloadBarProps = {
  activeEntity?: ArchiveEntity;
  showAllDownloads?: boolean;
};

const downloadItems: Array<{ entity: ArchiveEntity; label: string; description: string }> = [
  { entity: "orders", label: "Download orders sheet", description: "Archived order list for Excel" },
  { entity: "enquiries", label: "Download enquiries sheet", description: "Archived enquiry list for Excel" },
  { entity: "contact_requests", label: "Download contact requests sheet", description: "Archived contact requests for Excel" },
  { entity: "activity_logs", label: "Download activity logs sheet", description: "Archived activity logs for Excel" },
  { entity: "audit_logs", label: "Download audit logs sheet", description: "Archived audit logs for Excel" }
];

export function AdminArchiveDownloadBar({ activeEntity, showAllDownloads = false }: ArchiveDownloadBarProps) {
  const items = showAllDownloads
    ? downloadItems
    : activeEntity
      ? downloadItems.filter((item) => item.entity === activeEntity)
      : [];

  if (!items.length) return null;

  return (
    <section
      className="mb-4 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
      data-archive-download-bar
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">Download spreadsheet</h2>
        <p className="mt-1 text-xs text-[var(--platform-text-muted)]">
          UTF-8 CSV with Excel-safe columns. Commas, quotes, and line breaks in text are escaped to prevent corruption.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.entity}
            href={`/admin/archives/export/all/${ARCHIVE_ENTITY_SLUGS[item.entity]}`}
            className="inline-flex min-h-9 items-center rounded-[8px] border border-[var(--platform-accent)]/35 bg-[var(--platform-accent-soft)] px-4 text-sm font-medium text-[var(--platform-text-primary)] transition hover:border-[var(--platform-accent)]/60"
            title={item.description}
            data-archive-download={ARCHIVE_ENTITY_SLUGS[item.entity]}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
