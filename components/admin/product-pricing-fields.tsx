"use client";

import { useMemo, useState } from "react";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import {
  calculateProfitAndMargin,
  calculateSalePrice,
  derivePricingFormState,
  type ProductDiscountType
} from "@/lib/product-pricing";
import { formatINR } from "@/lib/utils";

type ProductPricingFieldsProps = {
  initialPrice: number;
  initialCompareAt?: number | null;
  initialOnSale?: boolean;
  initialDiscountType?: ProductDiscountType | null;
  initialDiscountValue?: number | null;
  initialCostOfGoods?: number | null;
  initialShowPricePerUnit?: boolean;
  variant?: "light" | "dark";
};

function currencyInputClass(variant: "light" | "dark") {
  return variant === "light"
    ? "h-10 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-950 outline-none focus:border-slate-400"
    : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] pl-8 pr-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";
}

function readonlyInputClass(variant: "light" | "dark") {
  return variant === "light"
    ? "h-10 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-600"
    : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)]/70 pl-8 pr-3 text-sm text-[var(--platform-text-muted)]";
}

function toggleClass(active: boolean, variant: "light" | "dark") {
  if (variant === "light") {
    return active
      ? "border-sky-500 bg-sky-500 text-white"
      : "border-slate-200 bg-white text-slate-500";
  }
  return active
    ? "platform-btn-primary"
    : "bg-[var(--platform-surface)] text-[var(--platform-text-muted)]";
}

export function ProductPricingFields({
  initialPrice,
  initialCompareAt,
  initialOnSale,
  initialDiscountType,
  initialDiscountValue,
  initialCostOfGoods,
  initialShowPricePerUnit = false,
  variant = "dark"
}: ProductPricingFieldsProps) {
  const initial = derivePricingFormState({
    price: initialPrice,
    compareAt: initialCompareAt,
    onSale: initialOnSale,
    discountType: initialDiscountType,
    discountValue: initialDiscountValue,
    costOfGoods: initialCostOfGoods
  });

  const [listPrice, setListPrice] = useState(String(initial.listPrice || ""));
  const [onSale, setOnSale] = useState(initial.onSale);
  const [discountType, setDiscountType] = useState<ProductDiscountType>(initial.discountType);
  const [discountValue, setDiscountValue] = useState(String(initial.discountValue || ""));
  const [costOfGoods, setCostOfGoods] = useState(String(initial.costOfGoods || ""));
  const [showPricePerUnit, setShowPricePerUnit] = useState(initialShowPricePerUnit);

  const numericListPrice = Number(listPrice) || 0;
  const numericDiscountValue = Number(discountValue) || 0;
  const numericCostOfGoods = Number(costOfGoods) || 0;

  const salePrice = useMemo(() => {
    if (!onSale) return numericListPrice;
    return calculateSalePrice({
      listPrice: numericListPrice,
      discountType,
      discountValue: numericDiscountValue
    });
  }, [discountType, numericDiscountValue, numericListPrice, onSale]);

  const { profit, marginPercent } = useMemo(
    () => calculateProfitAndMargin(salePrice, numericCostOfGoods),
    [numericCostOfGoods, salePrice]
  );

  const sectionTitleClass = variant === "light" ? "text-sm font-semibold text-slate-950" : "text-sm font-semibold text-slate-100";
  const sectionShellClass = variant === "light"
    ? "grid gap-4 rounded-xl border border-slate-200 bg-white p-4"
    : "grid gap-4";

  return (
    <section data-product-pricing-section className={sectionShellClass}>
      <h3 className={sectionTitleClass}>Pricing</h3>

      <label className="grid gap-1.5 text-sm">
        <ProductFieldLabel>Price</ProductFieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
          <input
            name="list_price"
            inputMode="decimal"
            value={listPrice}
            onChange={(event) => setListPrice(event.target.value)}
            className={currencyInputClass(variant)}
          />
        </div>
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          name="on_sale"
          value="true"
          checked={onSale}
          onChange={(event) => setOnSale(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600"
        />
        <span className={variant === "light" ? "text-slate-700" : "text-slate-200"}>On sale</span>
      </label>

      {onSale ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <ProductFieldLabel>Discount</ProductFieldLabel>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <input
                name="discount_value"
                inputMode="decimal"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                className={variant === "light"
                  ? "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400"
                  : "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"}
              />
              <div className="grid grid-cols-2 overflow-hidden rounded-lg bg-[var(--platform-surface)]">
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  className={`text-xs font-semibold ${toggleClass(discountType === "percent", variant)}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("amount")}
                  className={`text-xs font-semibold ${toggleClass(discountType === "amount", variant)}`}
                >
                  ₹
                </button>
              </div>
            </div>
            <input type="hidden" name="discount_type" value={discountType} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <ProductFieldLabel>Sale price</ProductFieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
              <input
                readOnly
                value={String(salePrice)}
                className={readonlyInputClass(variant)}
                aria-label="Calculated sale price"
              />
            </div>
          </label>
        </div>
      ) : null}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="show_price_per_unit"
          value="true"
          checked={showPricePerUnit}
          onChange={(event) => setShowPricePerUnit(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600"
        />
        <ProductFieldLabel tooltip="Show a per-unit price breakdown on the storefront when configured.">
          Show price per unit
        </ProductFieldLabel>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm">
          <ProductFieldLabel tooltip="Your cost to acquire or produce this product.">Cost of goods</ProductFieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
            <input
              name="cost_of_goods"
              inputMode="decimal"
              value={costOfGoods}
              onChange={(event) => setCostOfGoods(event.target.value)}
              className={currencyInputClass(variant)}
            />
          </div>
        </label>

        <label className="grid gap-1.5 text-sm">
          <ProductFieldLabel tooltip="Sale price minus cost of goods.">Profit</ProductFieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
            <input readOnly value={String(profit)} className={readonlyInputClass(variant)} aria-label="Calculated profit" />
          </div>
          <span className="sr-only">{formatINR(profit)}</span>
        </label>

        <label className="grid gap-1.5 text-sm">
          <ProductFieldLabel tooltip="Profit divided by sale price.">Margin</ProductFieldLabel>
          <div className="relative">
            <input readOnly value={String(marginPercent)} className={`${readonlyInputClass(variant)} pr-8`} aria-label="Calculated margin percent" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
          </div>
        </label>
      </div>
    </section>
  );
}
