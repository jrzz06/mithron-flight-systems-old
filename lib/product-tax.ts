import { formatINR } from "@/lib/utils";
import { fromPaise, roundInr, subtractInr, sumInr, toPaise } from "@/lib/currency";
import { getProductTaxGroup, resolveProductTaxRate } from "@/lib/product-tax-groups";

export type ProductTaxInput = {
  unitPrice: number;
  quantity?: number;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

export type ProductTaxBreakdown = {
  quantity: number;
  unitPrice: number;
  chargeTax: boolean;
  taxRate: number;
  taxIncluded: boolean;
  taxGroupLabel: string;
  taxableBase: number;
  taxAmount: number;
  lineTotal: number;
};

export function calculateProductTaxBreakdown(input: ProductTaxInput): ProductTaxBreakdown {
  const quantity = Math.max(1, input.quantity ?? 1);
  const unitPrice = Math.max(0, input.unitPrice);
  const chargeTax = input.chargeTax !== false;
  const taxIncluded = Boolean(input.taxIncluded);
  const taxRate = chargeTax ? resolveProductTaxRate(input) : 0;
  const taxGroupLabel = getProductTaxGroup(input.taxGroup).label;
  const grossPaise = toPaise(unitPrice) * quantity;

  if (!chargeTax || taxRate <= 0) {
    const gross = fromPaise(grossPaise);
    return {
      quantity,
      unitPrice,
      chargeTax: false,
      taxRate: 0,
      taxIncluded,
      taxGroupLabel,
      taxableBase: gross,
      taxAmount: 0,
      lineTotal: gross
    };
  }

  if (taxIncluded) {
    const taxAmountPaise = Math.round(grossPaise - grossPaise / (1 + taxRate / 100));
    const taxableBasePaise = grossPaise - taxAmountPaise;
    return {
      quantity,
      unitPrice,
      chargeTax: true,
      taxRate,
      taxIncluded: true,
      taxGroupLabel,
      taxableBase: fromPaise(taxableBasePaise),
      taxAmount: fromPaise(taxAmountPaise),
      lineTotal: fromPaise(grossPaise)
    };
  }

  const taxableBasePaise = grossPaise;
  const taxAmountPaise = Math.round(taxableBasePaise * (taxRate / 100));
  return {
    quantity,
    unitPrice,
    chargeTax: true,
    taxRate,
    taxIncluded: false,
    taxGroupLabel,
    taxableBase: fromPaise(taxableBasePaise),
    taxAmount: fromPaise(taxAmountPaise),
    lineTotal: fromPaise(taxableBasePaise + taxAmountPaise)
  };
}

export function summarizeCartTax(lines: ProductTaxInput[]) {
  const breakdowns = lines.map((line) => calculateProductTaxBreakdown(line));
  const subtotal = sumInr(breakdowns.map((line) => line.taxableBase));
  const taxTotal = sumInr(breakdowns.map((line) => line.taxAmount));
  const total = sumInr(breakdowns.map((line) => line.lineTotal));

  return {
    breakdowns,
    subtotal,
    taxTotal,
    total
  };
}

export type CartPricingSummary = {
  breakdowns: ProductTaxBreakdown[];
  itemsTotal: number;
  gstSgstTotal: number;
  roundingOff: number;
  finalAmount: number;
  subtotal: number;
  taxTotal: number;
  total: number;
};

const emptyCartPricingSummary = (): CartPricingSummary => ({
  breakdowns: [],
  itemsTotal: 0,
  gstSgstTotal: 0,
  roundingOff: 0,
  finalAmount: 0,
  subtotal: 0,
  taxTotal: 0,
  total: 0
});

/** Checkout/cart summary with GST + SGST and paise-balanced rounding. */
export function summarizeCartPricingBreakdown(lines: ProductTaxInput[]): CartPricingSummary {
  if (!lines.length) return emptyCartPricingSummary();

  const { breakdowns, subtotal, taxTotal } = summarizeCartTax(lines);
  const itemsTotal = subtotal;
  const gstSgstTotal = taxTotal;
  const rawPayable = sumInr([itemsTotal, gstSgstTotal]);
  const finalAmount = roundInr(rawPayable);
  const roundingOff = subtractInr(finalAmount, rawPayable);

  return {
    breakdowns,
    itemsTotal,
    gstSgstTotal,
    roundingOff,
    finalAmount: sumInr([itemsTotal, gstSgstTotal, roundingOff]),
    subtotal: itemsTotal,
    taxTotal: gstSgstTotal,
    total: sumInr([itemsTotal, gstSgstTotal, roundingOff])
  };
}

function formatProductTaxPriceLabel(input: ProductTaxInput) {
  const breakdown = calculateProductTaxBreakdown({ ...input, quantity: 1 });
  const priceLabel = formatINR(breakdown.unitPrice);

  if (!breakdown.chargeTax || breakdown.taxRate <= 0) {
    return priceLabel;
  }

  if (breakdown.taxIncluded) {
    return `${priceLabel} incl. GST`;
  }

  const gstAmount = roundInr(breakdown.unitPrice * (breakdown.taxRate / 100));
  return `${priceLabel} + ${breakdown.taxRate}% GST (${formatINR(gstAmount)})`;
}
