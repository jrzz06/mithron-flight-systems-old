"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import type { PressCoverageItem } from "@/services/press-coverage";
import { reorderPressCoverageFormAction } from "./actions";

const timedReorderPressCoverageFormAction = wrapServerAction(reorderPressCoverageFormAction, { label: "Reorder press coverage" });

export function PressCoverageReorderList({ items }: { items: PressCoverageItem[] }) {
  const initial = useMemo(
    () => [...items].sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title)),
    [items]
  );
  const [ordered, setOrdered] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  function moveItem(draggedId: string, targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrdered((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <form action={timedReorderPressCoverageFormAction} className="grid gap-3" data-press-reorder-list>
      <div className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
        <ul className="divide-y divide-[var(--platform-border)]">
          {ordered.map((item) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragId) moveItem(dragId, item.id);
                setDragId(null);
              }}
              className={`flex items-center gap-3 px-4 py-3 ${dragId === item.id ? "opacity-60" : ""}`}
            >
              <GripVertical className="size-4 shrink-0 text-[var(--platform-text-muted)]" aria-hidden="true" />
              <input type="hidden" name="ordered_ids" value={item.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--platform-text-primary)]">{item.title}</p>
                <p className="truncate text-xs text-[var(--platform-text-muted)]">
                  {item.publisher} · {item.status}
                </p>
              </div>
              <span className="text-xs text-[var(--platform-text-muted)]">#{item.sort_order}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <OperationalSubmitButton className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
          Save display order
        </OperationalSubmitButton>
      </div>
    </form>
  );
}
