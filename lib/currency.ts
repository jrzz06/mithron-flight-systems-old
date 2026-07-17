/** Canonical INR monetary math and display — all amounts flow through integer paise. */

export function toPaise(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Canonical 2-decimal INR storage value. */
export function roundInr(value: unknown): number {
  return fromPaise(toPaise(value));
}

export function sumInr(values: readonly number[]): number {
  const totalPaise = values.reduce((sum, value) => sum + toPaise(value), 0);
  return fromPaise(totalPaise);
}

export function addInr(...values: number[]): number {
  return sumInr(values);
}

export function subtractInr(minuend: number, subtrahend: number): number {
  return fromPaise(toPaise(minuend) - toPaise(subtrahend));
}

export type OrderTotalInput = {
  subtotal: number;
  taxTotal: number;
  shipping?: number;
  discount?: number;
};

export function computeOrderTotal(input: OrderTotalInput): number {
  const shipping = input.shipping ?? 0;
  const discount = input.discount ?? 0;
  const totalPaise =
    toPaise(input.subtotal) + toPaise(input.taxTotal) + toPaise(shipping) - toPaise(discount);
  return fromPaise(Math.max(0, totalPaise));
}

export function assertOrderTotalsBalance(
  input: OrderTotalInput & { total: number },
  label = "order totals"
): void {
  const expected = computeOrderTotal(input);
  if (toPaise(expected) !== toPaise(input.total)) {
    throw new Error(
      `${label} mismatch: subtotal(${input.subtotal}) + tax(${input.taxTotal}) + shipping(${input.shipping ?? 0}) - discount(${input.discount ?? 0}) = ${expected}, got ${input.total}`
    );
  }
}

export function inrAmountsMatch(expected: number, received: number, toleranceInr = 0.01): boolean {
  return Math.abs(roundInr(expected) - roundInr(received)) <= toleranceInr;
}

export function assertMinimumCheckoutAmount(amountInr: number, providerLabel: string): number {
  const normalized = roundInr(amountInr);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`Order total must be at least ₹1 for ${providerLabel} checkout.`);
  }
  return normalized;
}

function inrFractionDigits(amountInr: number): { minimumFractionDigits: 0 | 2; maximumFractionDigits: 2 } {
  const hasFraction = toPaise(amountInr) % 100 !== 0;
  return {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  };
}

/** Display with ₹ symbol — omits .00 for whole rupee amounts. */
export function formatInrDisplay(amountInr: number): string {
  const normalized = roundInr(amountInr);
  const { minimumFractionDigits, maximumFractionDigits } = inrFractionDigits(normalized);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(normalized);
}

/** Numeric amount only (no currency symbol) for invoice tables. */
export function formatInrAmount(amountInr: number): string {
  const normalized = roundInr(amountInr);
  const { minimumFractionDigits, maximumFractionDigits } = inrFractionDigits(normalized);
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(normalized);
}

/** @deprecated Use roundInr — kept for payment module compatibility. */
export function normalizeInrAmount(value: unknown): number {
  return roundInr(value);
}

/** @deprecated Use toPaise — kept for payment module compatibility. */
export function inrToPaise(amountInr: number): number {
  return toPaise(roundInr(amountInr));
}
