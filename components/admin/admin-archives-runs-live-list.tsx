"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataList } from "@/components/admin/module-panel";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import {
  ARCHIVE_ENTITY_SLUGS,
  type ArchiveEntity,
  type DataArchiveRunRow
} from "@/services/data-archive";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata"
  });
}

function mapArchiveRun(row: AdminEntityRow): DataArchiveRunRow {
  return {
    id: text(row.id),
    run_month: text(row.run_month),
    entity: text(row.entity),
    rows_archived: Number(row.rows_archived) || 0,
    csv_storage_path: row.csv_storage_path ? text(row.csv_storage_path) : null,
    status: text(row.status, "completed"),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
    created_at: text(row.created_at)
  };
}

function runsToListRows(runs: DataArchiveRunRow[]) {
  if (!runs.length) {
    return [{ label: "Archive runs", value: "0", detail: "No monthly archive runs recorded yet." }];
  }
  return runs.map((run) => ({
    label: `${run.entity} · ${run.run_month}`,
    value: String(run.rows_archived),
    detail: run.csv_storage_path
      ? `${run.csv_storage_path} | ${formatDate(run.created_at)}`
      : `No CSV file | ${formatDate(run.created_at)}`
  }));
}

type AdminArchivesRunsLiveListProps = {
  runs: DataArchiveRunRow[];
};

export function AdminArchivesRunsLiveList({ runs }: AdminArchivesRunsLiveListProps) {
  const liveRows = useAdminLiveCollectionRows(
    "archives",
    "data_archive_runs",
    runs as unknown as AdminEntityRow[],
    ["id"]
  );
  const liveRuns = useMemo(() => liveRows.map(mapArchiveRun), [liveRows]);
  const runsWithCsv = useMemo(
    () => liveRuns.filter((run) => run.csv_storage_path),
    [liveRuns]
  );

  return (
    <>
      <section className="rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5">
        <DataList rows={runsToListRows(liveRuns)} />
      </section>

      {runsWithCsv.length ? (
        <section className="mt-4 rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">
            Monthly snapshot files
          </h2>
          <ul className="grid gap-2 text-sm">
            {runsWithCsv.map((run) => {
              const month = String(run.run_month).slice(0, 7);
              const slug = ARCHIVE_ENTITY_SLUGS[run.entity as ArchiveEntity] ?? run.entity;
              return (
                <li key={run.id} className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/admin/archives/export/${slug}/${month}`}
                    className="font-medium text-[var(--platform-accent)] hover:underline"
                  >
                    {run.entity} · {month}.csv
                  </a>
                  <span className="text-[var(--platform-text-muted)]">({run.rows_archived} rows)</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
