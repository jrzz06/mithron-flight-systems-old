"use client";

export function SupplierFormDebugPanel({
  entries
}: {
  entries: Array<{ label: string; value: string }>;
}) {
  if (process.env.NODE_ENV === "production" || !entries.length) return null;

  return (
    <aside
      data-supplier-form-debug-panel
      className="rounded-[var(--platform-radius)] border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
    >
      <p className="font-semibold text-amber-800">Development form debug</p>
      <dl className="mt-2 grid gap-1.5">
        {entries.map((entry) => (
          <div key={entry.label} className="grid gap-0.5">
            <dt className="font-medium">{entry.label}</dt>
            <dd className="whitespace-pre-wrap break-all">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
