"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ProductEnquiryForm, type ProductEnquiryFormProduct } from "@/components/product/product-enquiry-form";
import styles from "./product-enquiry-modal.module.css";

export type ProductEnquiryProduct = ProductEnquiryFormProduct;

type ProductEnquiryModalProps = {
  open: boolean;
  product: ProductEnquiryProduct | null;
  onClose: () => void;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultRegion?: string;
  isGuest?: boolean;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
  );
}

export function ProductEnquiryModal({
  open,
  product,
  onClose,
  defaultEmail = "",
  defaultPhone = "",
  defaultRegion = "India",
  isGuest = true
}: ProductEnquiryModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    document.body.setAttribute("data-modal-scroll-locked", "true");

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      (focusable[0] ?? dialog).focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      document.body.removeAttribute("data-modal-scroll-locked");
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open || !product) return null;

  return createPortal(
    <div className={styles.root} data-product-enquiry-modal>
      <div
        className={styles.backdrop}
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className={styles.layer} role="presentation">
        <div
          ref={dialogRef}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>Send Enquiry</h2>
            <button type="button" className={styles.closeButton} aria-label="Close enquiry form" onClick={onClose}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className={styles.productChip} aria-label={`Product: ${product.name}`}>
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote/catalog URLs vary by product source
              <img
                src={product.image}
                alt=""
                width={40}
                height={40}
                className={styles.productThumb}
              />
            ) : (
              <span className={styles.productThumbFallback} aria-hidden="true">
                {product.name.slice(0, 2)}
              </span>
            )}
            <div className={styles.productChipText}>
              <p className={styles.productName}>{product.name}</p>
              <p className={styles.productSku}>SKU: {product.sku}</p>
            </div>
          </div>

          <div className={styles.formBody}>
            <ProductEnquiryForm
              key={`${product.slug}-${product.quantity}`}
              product={product}
              defaultEmail={defaultEmail}
              defaultPhone={defaultPhone}
              defaultRegion={defaultRegion}
              isGuest={isGuest}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
