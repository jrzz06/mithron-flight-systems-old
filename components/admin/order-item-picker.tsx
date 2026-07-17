"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderItemPickerLine } from "@/lib/admin/order-items";
import { formatINR } from "@/lib/utils";

type SearchResult = {
  slug: string;
  name: string;
  price: number;
};

type OrderItemPickerProps = {
  initialLines?: OrderItemPickerLine[];
  fieldName?: string;
  availableProducts?: SearchResult[];
};

const EMPTY_LINES: OrderItemPickerLine[] = [];
const EMPTY_PRODUCTS: SearchResult[] = [];

function linesSignature(lines: OrderItemPickerLine[]) {
  return lines
    .map((line) => `${line.productSlug}:${line.quantity}:${line.productName}:${line.unitPrice ?? ""}`)
    .join("|");
}

function fieldClassName() {
  return "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-focus-border)]";
}

export function OrderItemPicker({
  initialLines = EMPTY_LINES,
  fieldName = "order_items",
  availableProducts = EMPTY_PRODUCTS
}: OrderItemPickerProps) {
  const [lines, setLines] = useState<OrderItemPickerLine[]>(initialLines);
  const [selectedProductSlug, setSelectedProductSlug] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<SearchResult[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLinesKey = linesSignature(initialLines);

  // Sync from props only when content changes — never on fresh [] / new array identity.
  useEffect(() => {
    setLines(initialLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gate on content signature, not array identity
  }, [initialLinesKey]);

  useEffect(() => {
    if (productTimer.current) clearTimeout(productTimer.current);
    if (!productQuery.trim()) {
      setProductResults([]);
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

  function addProduct(result: SearchResult) {
    setLines((current) => {
      const existing = current.find((line) => line.productSlug === result.slug);
      if (existing) {
        return current.map((line) =>
          line.productSlug === result.slug
            ? { ...line, quantity: Math.min(99, line.quantity + 1) }
            : line
        );
      }
      return [
        ...current,
        {
          productSlug: result.slug,
          productName: result.name,
          quantity: 1,
          unitPrice: result.price
        }
      ];
    });
    setProductQuery("");
    setSelectedProductSlug("");
    setProductResults([]);
    productSearchRef.current?.focus();
  }

  function addSelectedProduct(productSlug: string) {
    setSelectedProductSlug(productSlug);
    const product = availableProducts.find((candidate) => candidate.slug === productSlug);
    if (product) addProduct(product);
  }

  function addProductFromEnter() {
    const first = productResults[0];
    if (first) addProduct(first);
  }

  function updateLineQuantity(index: number, quantity: number) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, quantity: Math.min(99, Math.max(1, quantity)) } : line
      )
    );
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  const orderItemsJson = JSON.stringify(
    lines.map((line) => ({
      productSlug: line.productSlug,
      quantity: line.quantity
    }))
  );

  return (
    <div className="grid gap-3" data-order-item-picker>
      <input type="hidden" name={fieldName} value={orderItemsJson} />
      <div className="grid gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
          Products for order
        </p>
        {availableProducts.length ? (
          <select
            aria-label="Select a product to add"
            value={selectedProductSlug}
            onChange={(event) => addSelectedProduct(event.target.value)}
            className={fieldClassName()}
          >
            <option value="">Select an available product…</option>
            {availableProducts
              .slice()
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((product) => (
                <option
                  key={product.slug}
                  value={product.slug}
                  disabled={lines.some((line) => line.productSlug === product.slug)}
                >
                  {product.name} — {formatINR(product.price)}
                </option>
              ))}
          </select>
        ) : null}
        {availableProducts.length ? (
          <p className="text-[11px] text-[var(--platform-text-muted)]">Or search the full catalog</p>
        ) : null}
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
          placeholder="Search product name or slug (Enter to add)"
          className={fieldClassName()}
          autoComplete="off"
        />
      </div>
      {productLoading ? <p className="text-xs text-[var(--platform-text-muted)]">Searching catalog…</p> : null}
      {productResults.length ? (
        <ul className="divide-y divide-[var(--platform-border)] rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          {productResults.map((result) => (
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

      {lines.length ? (
        <div className="overflow-x-auto rounded-[8px] border border-[var(--platform-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--platform-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border)]">
              {lines.map((line, index) => (
                <tr key={`${line.productSlug}-${index}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--platform-text-primary)]">{line.productName}</div>
                    <div className="text-xs text-[var(--platform-text-muted)]">{line.productSlug}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateLineQuantity(index, line.quantity - 1)}
                        className="h-8 w-8 rounded border border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={line.quantity}
                        onChange={(event) => updateLineQuantity(index, Number(event.target.value))}
                        className="w-14 rounded border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-2 py-1 text-center"
                      />
                      <button
                        type="button"
                        onClick={() => updateLineQuantity(index, line.quantity + 1)}
                        className="h-8 w-8 rounded border border-[var(--platform-border)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-muted)]"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-xs text-rose-300 hover:text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[var(--platform-text-muted)]">
          No products selected — order will be created with needs-products flag unless you add items above.
        </p>
      )}
    </div>
  );
}
