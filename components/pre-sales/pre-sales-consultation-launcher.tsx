"use client";

import dynamic from "next/dynamic";
import { Headset } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type PreSalesConsultationValues
} from "@/components/pre-sales/pre-sales-consultation-panel";
import { submitPreSalesConsultation } from "@/components/pre-sales/submit-pre-sales-consultation";
import { glassButtonClassName } from "@/lib/glass-ui";
import { notify } from "@/lib/feedback/notify";
import { deriveProductSku } from "@/lib/product-sku";
import { hasPreSalesAutoShown, markPreSalesAutoShown } from "@/lib/pre-sales/pre-sales-seen";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import styles from "./pre-sales-consultation.module.css";

const PreSalesConsultationPanel = dynamic(
  () =>
    import("@/components/pre-sales/pre-sales-consultation-panel").then(
      (mod) => mod.PreSalesConsultationPanel
    ),
  { ssr: false, loading: () => null }
);

const AUTO_OPEN_DELAY_MS = 3000;

function productSlugFromPathname(pathname: string) {
  if (!pathname.startsWith("/product/")) return null;
  const slug = pathname.replace("/product/", "").split("/")[0]?.trim();
  return slug ? slug : null;
}

type ProductSummary = {
  slug: string;
  name: string;
  image?: string | null;
  url?: string;
};

export function PreSalesConsultationLauncher() {
  const pathname = usePathname() ?? "";
  const cartItems = useCartStore((state) => state.items);
  const productSlug = useMemo(() => productSlugFromPathname(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReference, setSuccessReference] = useState<string | null>(null);
  const [productSummary, setProductSummary] = useState<ProductSummary | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!productSlug) {
      setProductSummary(null);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/products/summary?slug=${encodeURIComponent(productSlug)}`, {
          cache: "no-store"
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; slug?: string; name?: string; image?: string | null; url?: string }
          | null;
        if (!body?.ok || !body.slug || cancelled) return;
        setProductSummary({
          slug: body.slug,
          name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : body.slug,
          image: body.image ?? null,
          url: typeof body.url === "string" ? body.url : `/product/${body.slug}`
        });
      } catch {
        if (!cancelled) {
          setProductSummary({ slug: productSlug, name: productSlug, url: `/product/${productSlug}` });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  const openPanel = useCallback((markSeen: boolean) => {
    if (markSeen) markPreSalesAutoShown();
    setError(null);
    setSuccessReference(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (hasPreSalesAutoShown()) return;
    const timer = window.setTimeout(() => {
      if (hasPreSalesAutoShown()) return;
      openPanel(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [openPanel]);

  const summaryLabel = useMemo(() => {
    if (cartItems.length > 0) {
      return cartItems.map((item) => item.productName || item.productSlug).join(", ");
    }
    if (productSummary) return productSummary.name;
    return "General consultation";
  }, [cartItems, productSummary]);

  const closePanel = useCallback(() => {
    markPreSalesAutoShown();
    setOpen(false);
    setError(null);
    setSuccessReference(null);
    setSubmitting(false);
  }, []);

  async function handleSubmit(values: PreSalesConsultationValues) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitPreSalesConsultation({
        values,
        cartItems,
        product: productSummary
          ? {
              slug: productSummary.slug,
              name: productSummary.name,
              sku: deriveProductSku(productSummary.slug),
              image: productSummary.image,
              productUrl: productSummary.url
            }
          : productSlug
            ? {
                slug: productSlug,
                name: productSlug,
                sku: deriveProductSku(productSlug),
                productUrl: `/product/${productSlug}`
              }
            : null
      });

      if (!result.ok) {
        setError(result.error);
        notify.error(result.error, { source: "enquiry" });
        setSubmitting(false);
        return;
      }

      markPreSalesAutoShown();
      setSuccessReference(result.reference);
      notify.success(`Consultation request received (${result.reference})`, { source: "enquiry" });
      setSubmitting(false);
    } catch {
      const message = "Something went wrong while sending your enquiry. Please try again.";
      setError(message);
      notify.error(message, { source: "enquiry" });
      setSubmitting(false);
    }
  }

  return (
    <>
      {!open ? (
        <div className={styles.fabRoot} data-pre-sales-launcher>
          <button
            type="button"
            aria-label="Open Pre-Sales Consultation"
            className={cn(
              glassButtonClassName({ className: styles.fabButton }),
              !reduceMotion && styles.fabBounce
            )}
            onClick={() => openPanel(true)}
          >
            <span className={styles.fabIconWrap} aria-hidden="true">
              <Headset className={styles.fabIcon} strokeWidth={2.25} />
            </span>
            <span className={styles.fabTooltip} role="tooltip" aria-hidden="true">
              Pre-Sales Consultation
            </span>
          </button>
        </div>
      ) : null}

      {open ? (
        <PreSalesConsultationPanel
          open={open}
          onClose={closePanel}
          onCancel={closePanel}
          onSubmit={handleSubmit}
          variant="storefront"
          productSummary={summaryLabel}
          submitting={submitting}
          error={error}
          successReference={successReference}
        />
      ) : null}
    </>
  );
}
