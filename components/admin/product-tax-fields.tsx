"use client";

import { useMemo, useState } from "react";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import {
  getProductTaxGroup,
  isProductTaxGroupId,
  PRODUCT_TAX_GROUPS,
  type ProductTaxGroupId
} from "@/lib/product-tax-groups";

type ProductTaxFieldsProps = {
  initialChargeTax?: boolean;
  initialTaxGroup?: string | null;
  initialTaxRate?: number | null;
  initialTaxIncluded?: boolean;
  variant?: "light" | "dark";
};

function selectClass(variant: "light" | "dark") {
  return variant === "light"
    ? "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400"
    : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";
}

function readonlyInputClass(variant: "light" | "dark") {
  return variant === "light"
    ? "h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600"
    : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)]/70 px-3 text-sm text-[var(--platform-text-muted)]";
}

export function ProductTaxFields({
  initialChargeTax = true,
  initialTaxGroup,
  initialTaxIncluded = false,
  variant = "dark"
}: ProductTaxFieldsProps) {
  const defaultGroup = isProductTaxGroupId(initialTaxGroup) ? initialTaxGroup : "products-default";
  const [chargeTax, setChargeTax] = useState(initialChargeTax);
  const [taxGroup, setTaxGroup] = useState<ProductTaxGroupId>(defaultGroup);
  const [taxIncluded, setTaxIncluded] = useState(initialTaxIncluded);

  const selectedGroup = useMemo(() => getProductTaxGroup(taxGroup), [taxGroup]);
  const taxRate = selectedGroup.rate;

  const sectionTitleClass = variant === "light" ? "text-sm font-semibold text-slate-950" : "text-sm font-semibold text-slate-100";
  const sectionShellClass = variant === "light"
    ? "grid gap-4 rounded-xl border border-slate-200 bg-white p-4"
    : "grid gap-4";
  const advancedShellClass = variant === "light"
    ? "grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    : "grid gap-3";

  return (
    <section data-product-tax-section className={sectionShellClass}>
      <h3 className={sectionTitleClass}>Tax</h3>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="charge_tax"
          value="true"
          checked={chargeTax}
          onChange={(event) => setChargeTax(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600"
        />
        <ProductFieldLabel tooltip="When enabled, GST is calculated for this product at checkout.">
          Charge tax on this product
        </ProductFieldLabel>
      </label>

      {chargeTax ? (
        <>
          <section data-product-tax-advanced className={advancedShellClass}>
            <h4 className={sectionTitleClass}>Advanced</h4>
            <label className="grid gap-1.5 text-sm">
              <ProductFieldLabel tooltip="Indian GST catalog group. The GST rate is applied from the selected group.">
                Product tax group
              </ProductFieldLabel>
              <select
                name="tax_group"
                value={taxGroup}
                onChange={(event) => setTaxGroup(event.target.value as ProductTaxGroupId)}
                className={selectClass(variant)}
              >
                {PRODUCT_TAX_GROUPS.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
            <p className={variant === "light" ? "text-xs leading-5 text-slate-500" : "text-xs leading-5 text-slate-400"}>
              {selectedGroup.description}
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <ProductFieldLabel tooltip="GST rate derived from the selected tax group.">GST rate</ProductFieldLabel>
              <div className="relative">
                <input
                  readOnly
                  value={String(taxRate)}
                  className={`${readonlyInputClass(variant)} pr-8`}
                  aria-label="GST rate from tax group"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
              </div>
              <input type="hidden" name="tax_rate" value={String(taxRate)} />
            </label>

            <label className="inline-flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                name="tax_included"
                value="true"
                checked={taxIncluded}
                onChange={(event) => setTaxIncluded(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600"
              />
              <ProductFieldLabel tooltip="Enable when the listed price already includes GST.">
                Price includes tax
              </ProductFieldLabel>
            </label>
          </div>
        </>
      ) : null}
    </section>
  );
}
