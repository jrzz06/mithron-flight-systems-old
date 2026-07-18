"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";
import { deleteMediaLibraryItemFormAction, type MediaLibraryItem } from "./actions";

const timedDeleteMediaLibraryItemFormAction = wrapServerAction(deleteMediaLibraryItemFormAction, { label: "Delete media item" });

function toMediaAssetRow(item: MediaLibraryItem): AdminEntityRow {
  return {
    id: item.id,
    public_url: item.publicUrl,
    folder: item.folder,
    mime_type: item.mimeType,
    width: item.width,
    height: item.height,
    size_bytes: item.sizeBytes,
    alt_text: item.altText,
    updated_at: item.updatedAt
  };
}

function fromMediaAssetRow(row: AdminEntityRow): MediaLibraryItem {
  return {
    id: String(row.id ?? ""),
    publicUrl: String(row.public_url ?? row.publicUrl ?? ""),
    folder: String(row.folder ?? ""),
    mimeType: String(row.mime_type ?? row.mimeType ?? ""),
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    altText: String(row.alt_text ?? row.altText ?? ""),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? "")
  };
}

export function MediaLibraryClient({ items }: { items: MediaLibraryItem[] }) {
  const [query, setQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const ssrRows = useMemo(() => items.map(toMediaAssetRow), [items]);
  const liveRows = useAdminLiveCollectionRows("media", "media_assets", ssrRows, ["id"]);
  const liveItems = useMemo(() => liveRows.map(fromMediaAssetRow), [liveRows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return liveItems;
    return liveItems.filter((item) =>
      [item.id, item.folder, item.altText, item.publicUrl].some((value) => value.toLowerCase().includes(needle))
    );
  }, [liveItems, query]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 12
  });

  return (
    <div className="grid gap-4" data-admin-media-library>
      <label className="grid gap-1 text-sm">
        <span className="text-[var(--platform-text-muted)]">Search media</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Folder, alt text, URL…"
          className="h-10 rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
        />
      </label>
      <p className="text-xs text-[var(--platform-text-muted)]">
        Showing {filtered.length} of {liveItems.length} assets
      </p>
      <div ref={parentRef} className="h-[70vh] overflow-auto rounded-[12px] border border-[var(--platform-border)]">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filtered[virtualRow.index]!;
            return (
              <div
                key={item.id}
                className="absolute left-0 flex w-full items-center gap-3 border-b border-[var(--platform-border)] px-3 py-2"
                style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--platform-surface-muted)]">
                  {item.publicUrl ? (
                    <Image src={item.publicUrl} alt={item.altText || item.id} fill className="object-cover" sizes="80px" unoptimized />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--platform-text-primary)]">{item.altText || item.id}</p>
                  <p className="truncate text-xs text-[var(--platform-text-muted)]">
                    {item.folder || "root"} · {item.mimeType || "unknown"}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                  </p>
                </div>
                <form action={timedDeleteMediaLibraryItemFormAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <OperationalSubmitButton
                    pendingLabel="Deleting..."
                    confirmMessage="Delete this media item?"
                    className="text-xs font-medium text-rose-400"
                  >
                    Delete
                  </OperationalSubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
