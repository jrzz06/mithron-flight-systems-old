import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";

const SPEC_ROW_COUNT = 8;

const fieldClass =
  "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";

export function ProductSpecFields({
  specs
}: {
  specs?: Record<string, string> | null;
}) {
  const entries = Object.entries(specs ?? {}).filter(([key, value]) => key.trim() && String(value ?? "").trim());
  const rowCount = Math.max(SPEC_ROW_COUNT, entries.length);
  const rows = Array.from({ length: rowCount }, (_, index) => entries[index] ?? ["", ""]);

  return (
    <section data-product-spec-fields className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProductFieldLabel tooltip="Structured key/value specs shown on the storefront spec table. Saved exactly as typed - nothing here gets auto-rewritten.">
          Key specs
        </ProductFieldLabel>
        <span className="text-xs text-[var(--platform-text-muted)]">Optional - leave blank rows empty</span>
      </div>
      <input type="hidden" name="specs_editor_present" value="1" />
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <input name="spec_key" defaultValue={row[0]} placeholder="Battery" className={fieldClass} />
            <input name="spec_value" defaultValue={row[1]} placeholder="30,000 mAh" className={fieldClass} />
          </div>
        ))}
      </div>
    </section>
  );
}
