"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminFormSection } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";
import { calculateProductTaxBreakdown } from "@/lib/product-tax";
import { computeOrderTotal, sumInr } from "@/lib/currency";
import { formatINR } from "@/lib/utils";

const DRAFT_STORAGE_KEY = "mithron:admin-manual-order-draft";

type CatalogProduct = {
  slug: string;
  name: string;
  price: number;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

type OrderLine = {
  productSlug: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

type CustomerLookupResult = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
};

type ManualOrderDraft = {
  customerFullName: string;
  customerEmail: string;
  customerPhone: string;
  customerUserId: string;
  createCustomer: boolean;
  shippingLabel: string;
  shippingLine1: string;
  shippingLine2: string;
  shippingCity: string;
  shippingRegion: string;
  shippingPostalCode: string;
  shippingCountry: string;
  shippingPhone: string;
  billingSameAsShipping: boolean;
  billingLabel: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingRegion: string;
  billingPostalCode: string;
  billingCountry: string;
  billingPhone: string;
  paymentMethod: string;
  shippingAmount: string;
  discountAmount: string;
  customerNote: string;
  internalNote: string;
  sendCustomerNotification: boolean;
  lines: OrderLine[];
};

type ManualOrderCreatePanelProps = {
  products: CatalogProduct[];
  defaultWarehouseCode: string;
  createAction: (formData: FormData) => Promise<void>;
};

type SearchResult = {
  slug: string;
  name: string;
  price: number;
};

const paymentOptions = [
  { value: "paid", label: "Paid (manual verification)" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "cod", label: "Cash on delivery" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "manual", label: "Manual payment recorded" },
  { value: "not_required", label: "Payment not required" }
] as const;

function defaultDraft(): ManualOrderDraft {
  return {
    customerFullName: "",
    customerEmail: "",
    customerPhone: "",
    customerUserId: "",
    createCustomer: false,
    shippingLabel: "Shipping",
    shippingLine1: "",
    shippingLine2: "",
    shippingCity: "",
    shippingRegion: "",
    shippingPostalCode: "",
    shippingCountry: "India",
    shippingPhone: "",
    billingSameAsShipping: true,
    billingLabel: "Billing",
    billingLine1: "",
    billingLine2: "",
    billingCity: "",
    billingRegion: "",
    billingPostalCode: "",
    billingCountry: "India",
    billingPhone: "",
    paymentMethod: "paid",
    shippingAmount: "0",
    discountAmount: "0",
    customerNote: "",
    internalNote: "",
    sendCustomerNotification: true,
    lines: []
  };
}

function fieldClassName() {
  return "rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-focus-border)]";
}

function readDraftFromStorage(): ManualOrderDraft {
  if (typeof window === "undefined") return defaultDraft();
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return defaultDraft();
    const parsed = JSON.parse(raw) as Partial<ManualOrderDraft>;
    return { ...defaultDraft(), ...parsed, lines: Array.isArray(parsed.lines) ? parsed.lines : [] };
  } catch {
    return defaultDraft();
  }
}

function productFromCatalog(products: CatalogProduct[], slug: string, fallbackName: string, fallbackPrice: number): OrderLine {
  const match = products.find((product) => product.slug === slug);
  return {
    productSlug: slug,
    productName: match?.name ?? fallbackName,
    quantity: 1,
    unitPrice: Number(match?.price ?? fallbackPrice) || 0,
    chargeTax: match?.chargeTax,
    taxRate: match?.taxRate,
    taxIncluded: match?.taxIncluded,
    taxGroup: match?.taxGroup
  };
}

export function ManualOrderCreatePanel({
  products,
  defaultWarehouseCode,
  createAction
}: ManualOrderCreatePanelProps) {
  // Always start with the default draft so SSR and the first client render match.
  // localStorage draft is applied after mount to avoid hydration mismatches.
  const [draft, setDraft] = useState<ManualOrderDraft>(() => defaultDraft());
  const timedCreateAction = useMemo(
    () => wrapServerAction(createAction, { label: "Create manual order" }),
    [createAction]
  );
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<CustomerLookupResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<SearchResult[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const effectiveLookupResults = lookupQuery.trim().length < 2 ? [] : lookupResults;
  const effectiveProductResults = productQuery.trim() ? productResults : [];
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(readDraftFromStorage());
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, draftHydrated]);

  const updateDraft = useCallback((patch: Partial<ManualOrderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (lookupQuery.trim().length < 2) {
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const response = await fetch(`/api/admin/customers/lookup?q=${encodeURIComponent(lookupQuery.trim())}`);
        if (!response.ok) {
          setLookupResults([]);
          return;
        }
        const payload = (await response.json()) as { results?: CustomerLookupResult[] };
        setLookupResults(payload.results ?? []);
      } catch {
        setLookupResults([]);
      } finally {
        setLookupLoading(false);
      }
    }, 300);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [lookupQuery]);

  useEffect(() => {
    if (productTimer.current) clearTimeout(productTimer.current);
    if (!productQuery.trim()) {
      return;
    }
    productTimer.current = setTimeout(async () => {
      setProductLoading(true);
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(productQuery.trim())}&limit=8`);
        if (!response.ok) {
          setProductResults([]);
          return;
        }
        const payload = (await response.json()) as { results?: SearchResult[] };
        setProductResults(payload.results ?? []);
      } catch {
        setProductResults([]);
      } finally {
        setProductLoading(false);
      }
    }, 250);
    return () => {
      if (productTimer.current) clearTimeout(productTimer.current);
    };
  }, [productQuery]);

  function selectCustomer(customer: CustomerLookupResult) {
    updateDraft({
      customerUserId: customer.id,
      customerEmail: customer.email,
      customerPhone: customer.phone ?? draft.customerPhone,
      customerFullName: customer.displayName,
      shippingPhone: customer.phone ?? draft.shippingPhone
    });
    setLookupQuery("");
    setLookupResults([]);
  }

  function addProduct(result: SearchResult) {
    const key = result.slug;
    if (draft.lines.some((line) => line.productSlug === key && !line.sku)) {
      return;
    }
    const line = productFromCatalog(products, result.slug, result.name, result.price);
    updateDraft({ lines: [...draft.lines, line] });
    setProductQuery("");
    setProductResults([]);
    productSearchRef.current?.focus();
  }

  function addProductFromEnter() {
    const trimmed = productQuery.trim().toLowerCase();
    if (!trimmed) return;
    const localMatch = products.find(
      (product) => product.slug.toLowerCase().includes(trimmed) || product.name.toLowerCase().includes(trimmed)
    );
    const remoteMatch = effectiveProductResults[0];
    const target = remoteMatch ?? (localMatch ? { slug: localMatch.slug, name: localMatch.name, price: localMatch.price } : null);
    if (target) addProduct(target);
  }

  function updateLineQuantity(index: number, quantity: number) {
    const next = draft.lines.map((line, lineIndex) =>
      lineIndex === index ? { ...line, quantity: Math.min(99, Math.max(1, quantity)) } : line
    );
    updateDraft({ lines: next });
  }

  function removeLine(index: number) {
    updateDraft({ lines: draft.lines.filter((_, lineIndex) => lineIndex !== index) });
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of draft.lines) {
      const breakdown = calculateProductTaxBreakdown({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        chargeTax: line.chargeTax,
        taxRate: line.taxRate,
        taxIncluded: line.taxIncluded,
        taxGroup: line.taxGroup
      });
      subtotal += breakdown.taxableBase;
      taxTotal += breakdown.taxAmount;
    }
    const shipping = Math.max(0, Number(draft.shippingAmount) || 0);
    const discount = Math.max(0, Number(draft.discountAmount) || 0);
    const normalizedSubtotal = sumInr([subtotal]);
    const normalizedTax = sumInr([taxTotal]);
    const total = computeOrderTotal({
      subtotal: normalizedSubtotal,
      taxTotal: normalizedTax,
      shipping,
      discount
    });
    return { subtotal: normalizedSubtotal, taxTotal: normalizedTax, shipping, discount, total };
  }, [draft.discountAmount, draft.lines, draft.shippingAmount]);

  const confirmMessage = useMemo(() => {
    const customer = draft.customerFullName || draft.customerEmail || "Guest customer";
    const payment = paymentOptions.find((option) => option.value === draft.paymentMethod)?.label ?? draft.paymentMethod;
    return [
      "Create this order?",
      `Customer: ${customer}`,
      `Items: ${draft.lines.length}`,
      `Total: ${formatINR(totals.total)}`,
      `Payment: ${payment}`
    ].join("\n");
  }, [draft.customerEmail, draft.customerFullName, draft.lines.length, draft.paymentMethod, totals.total]);

  const orderItemsJson = JSON.stringify(
    draft.lines.map((line) => ({
      productSlug: line.productSlug,
      quantity: line.quantity,
      ...(line.sku ? { sku: line.sku } : {})
    }))
  );

  return (
    <AdminFormSection
      title="Create order"
      description="Capture a customer order with stock validation, pricing, and payment method. Warehouse assignment remains a separate step."
      className="scroll-mt-24"
    >
      <form action={timedCreateAction} className="grid gap-6">
        <input type="hidden" name="warehouse_code" value={defaultWarehouseCode} />
        <input type="hidden" name="order_items" value={orderItemsJson} />
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />
        {draft.customerUserId ? <input type="hidden" name="customer_user_id" value={draft.customerUserId} /> : null}
        {draft.sendCustomerNotification ? <input type="hidden" name="send_customer_notification" value="1" /> : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 grid gap-2">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--platform-text-muted)]">Find existing customer</span>
              <input
                value={lookupQuery}
                onChange={(event) => setLookupQuery(event.target.value)}
                placeholder="Search by email, phone, or name"
                className={fieldClassName()}
                autoComplete="off"
              />
            </label>
            {lookupLoading ? <p className="text-xs text-[var(--platform-text-muted)]">Searching customers…</p> : null}
            {effectiveLookupResults.length ? (
              <ul className="divide-y divide-[var(--platform-border)] rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
                {effectiveLookupResults.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-[var(--platform-surface-raised)]"
                    >
                      <span className="font-medium text-[var(--platform-text-primary)]">{customer.displayName}</span>
                      <span className="text-xs text-[var(--platform-text-muted)]">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Full name</span>
            <input
              name="customer_full_name"
              value={draft.customerFullName}
              onChange={(event) => updateDraft({ customerFullName: event.target.value })}
              className={fieldClassName()}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Email</span>
            <input
              name="customer_email"
              type="email"
              required
              value={draft.customerEmail}
              onChange={(event) => updateDraft({ customerEmail: event.target.value })}
              className={fieldClassName()}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Phone</span>
            <input
              name="customer_phone"
              required
              value={draft.customerPhone}
              onChange={(event) => updateDraft({ customerPhone: event.target.value })}
              className={fieldClassName()}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--platform-text-secondary)]">
            <input
              type="checkbox"
              name="create_customer"
              checked={draft.createCustomer}
              onChange={(event) => updateDraft({ createCustomer: event.target.checked })}
              className="rounded border-[var(--platform-border)]"
            />
            Create account if customer is new
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <h3 className="md:col-span-2 text-sm font-semibold text-[var(--platform-text-primary)]">Shipping address</h3>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-[var(--platform-text-muted)]">Address line 1</span>
            <input name="shipping_line1" required value={draft.shippingLine1} onChange={(event) => updateDraft({ shippingLine1: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-[var(--platform-text-muted)]">Address line 2</span>
            <input name="shipping_line2" value={draft.shippingLine2} onChange={(event) => updateDraft({ shippingLine2: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">City</span>
            <input name="shipping_city" required value={draft.shippingCity} onChange={(event) => updateDraft({ shippingCity: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">State / region</span>
            <input name="shipping_region" required value={draft.shippingRegion} onChange={(event) => updateDraft({ shippingRegion: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Postal code</span>
            <input name="shipping_postal_code" required value={draft.shippingPostalCode} onChange={(event) => updateDraft({ shippingPostalCode: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Country</span>
            <input name="shipping_country" value={draft.shippingCountry} onChange={(event) => updateDraft({ shippingCountry: event.target.value })} className={fieldClassName()} />
          </label>
          <input type="hidden" name="shipping_label" value={draft.shippingLabel} />
          <input type="hidden" name="shipping_phone" value={draft.shippingPhone || draft.customerPhone} />

          <label className="md:col-span-2 flex items-center gap-2 text-sm text-[var(--platform-text-secondary)]">
            <input
              type="checkbox"
              name="billing_same_as_shipping"
              checked={draft.billingSameAsShipping}
              onChange={(event) => updateDraft({ billingSameAsShipping: event.target.checked })}
              className="rounded border-[var(--platform-border)]"
            />
            Billing same as shipping
          </label>

          {!draft.billingSameAsShipping ? (
            <>
              <h3 className="md:col-span-2 text-sm font-semibold text-[var(--platform-text-primary)]">Billing address</h3>
              <label className="grid gap-2 text-sm md:col-span-2">
                <span className="text-[var(--platform-text-muted)]">Address line 1</span>
                <input name="billing_line1" required value={draft.billingLine1} onChange={(event) => updateDraft({ billingLine1: event.target.value })} className={fieldClassName()} />
              </label>
              <label className="grid gap-2 text-sm md:col-span-2">
                <span className="text-[var(--platform-text-muted)]">Address line 2</span>
                <input name="billing_line2" value={draft.billingLine2} onChange={(event) => updateDraft({ billingLine2: event.target.value })} className={fieldClassName()} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-[var(--platform-text-muted)]">City</span>
                <input name="billing_city" required value={draft.billingCity} onChange={(event) => updateDraft({ billingCity: event.target.value })} className={fieldClassName()} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-[var(--platform-text-muted)]">State / region</span>
                <input name="billing_region" required value={draft.billingRegion} onChange={(event) => updateDraft({ billingRegion: event.target.value })} className={fieldClassName()} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-[var(--platform-text-muted)]">Postal code</span>
                <input name="billing_postal_code" required value={draft.billingPostalCode} onChange={(event) => updateDraft({ billingPostalCode: event.target.value })} className={fieldClassName()} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-[var(--platform-text-muted)]">Country</span>
                <input name="billing_country" value={draft.billingCountry} onChange={(event) => updateDraft({ billingCountry: event.target.value })} className={fieldClassName()} />
              </label>
              <input type="hidden" name="billing_label" value={draft.billingLabel} />
              <input type="hidden" name="billing_phone" value={draft.billingPhone || draft.customerPhone} />
            </>
          ) : null}
        </section>

        <section className="grid gap-4" data-order-product-picker>
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Products</h3>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Search catalog (Enter to add first match)</span>
            <input
              ref={productSearchRef}
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addProductFromEnter();
                }
              }}
              placeholder="Product name or slug"
              className={fieldClassName()}
              autoComplete="off"
            />
          </label>
          {productLoading ? <p className="text-xs text-[var(--platform-text-muted)]">Searching catalog…</p> : null}
          {effectiveProductResults.length ? (
            <ul className="divide-y divide-[var(--platform-border)] rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
              {effectiveProductResults.map((result) => (
                <li key={result.slug}>
                  <button
                    type="button"
                    onClick={() => addProduct(result)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--platform-surface-raised)]"
                  >
                    <span className="text-[var(--platform-text-primary)]">{result.name}</span>
                    <span className="text-xs text-[var(--platform-text-muted)]">{formatINR(result.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {draft.lines.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--platform-border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--platform-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--platform-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border)]">
                  {draft.lines.map((line, index) => {
                    const breakdown = calculateProductTaxBreakdown({
                      unitPrice: line.unitPrice,
                      quantity: line.quantity,
                      chargeTax: line.chargeTax,
                      taxRate: line.taxRate,
                      taxIncluded: line.taxIncluded,
                      taxGroup: line.taxGroup
                    });
                    return (
                      <tr key={`${line.productSlug}-${line.sku ?? ""}-${index}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-[var(--platform-text-primary)]">{line.productName}</div>
                          <div className="text-xs text-[var(--platform-text-muted)]">{line.productSlug}</div>
                        </td>
                        <td className="px-3 py-2 text-[var(--platform-text-secondary)]">{formatINR(line.unitPrice)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={line.quantity}
                            onChange={(event) => updateLineQuantity(index, Number(event.target.value))}
                            className="w-16 rounded border border-slate-700 bg-[var(--platform-surface-muted)] px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2 text-[var(--platform-text-secondary)]">{formatINR(breakdown.lineTotal)}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeLine(index)} className="text-xs text-rose-300 hover:text-rose-200">
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--platform-text-muted)]">Add at least one product to create an order.</p>
          )}
        </section>

        <section className="grid gap-3 rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 md:grid-cols-2">
          <div className="md:col-span-2 text-sm font-semibold text-[var(--platform-text-primary)]">Order totals (estimate)</div>
          <div className="flex justify-between text-sm text-[var(--platform-text-secondary)]"><span>Subtotal</span><span>{formatINR(totals.subtotal)}</span></div>
          <div className="flex justify-between text-sm text-[var(--platform-text-secondary)]"><span>Tax</span><span>{formatINR(totals.taxTotal)}</span></div>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Shipping</span>
            <input name="shipping_amount" type="number" min={0} step="0.01" value={draft.shippingAmount} onChange={(event) => updateDraft({ shippingAmount: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Discount</span>
            <input name="discount_amount" type="number" min={0} step="0.01" value={draft.discountAmount} onChange={(event) => updateDraft({ discountAmount: event.target.value })} className={fieldClassName()} />
          </label>
          <div className="md:col-span-2 flex justify-between border-t border-[var(--platform-border)] pt-3 text-base font-semibold text-[var(--platform-text-primary)]">
            <span>Total</span>
            <span>{formatINR(totals.total)}</span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--platform-text-muted)]">Payment method</span>
            <select
              name="payment_method"
              value={draft.paymentMethod}
              onChange={(event) => updateDraft({ paymentMethod: event.target.value })}
              className={fieldClassName()}
            >
              {paymentOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-[var(--platform-text-secondary)]">
            <input
              type="checkbox"
              checked={draft.sendCustomerNotification}
              onChange={(event) => updateDraft({ sendCustomerNotification: event.target.checked })}
              className="rounded border-[var(--platform-border)]"
            />
            Notify customer about this order
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-[var(--platform-text-muted)]">Customer note</span>
            <textarea name="customer_note" rows={2} value={draft.customerNote} onChange={(event) => updateDraft({ customerNote: event.target.value })} className={fieldClassName()} />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-[var(--platform-text-muted)]">Internal note</span>
            <textarea name="internal_note" rows={2} value={draft.internalNote} onChange={(event) => updateDraft({ internalNote: event.target.value })} className={fieldClassName()} />
          </label>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <OperationalSubmitButton
            pendingLabel="Creating order"
            confirmMessage={confirmMessage}
            disabled={!draft.lines.length || !draft.customerEmail.trim() || !draft.customerPhone.trim()}
          >
            Create order
          </OperationalSubmitButton>
          <button
            type="button"
            onClick={() => {
              setDraft(defaultDraft());
              window.localStorage.removeItem(DRAFT_STORAGE_KEY);
            }}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-[var(--platform-text-secondary)]"
          >
            Clear draft
          </button>
        </div>
      </form>
    </AdminFormSection>
  );
}
