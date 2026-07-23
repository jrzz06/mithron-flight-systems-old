"use client";

import { useState, type FormEvent } from "react";
import {
  CUSTOMER_CONTACT_REQUIRED_MESSAGE,
  isValidCustomerEmail,
  isValidCustomerPhone
} from "@/lib/api/customer-contact";
import { buildGuestRequestHeaders } from "@/lib/api/client-audit-token-client";
import {
  PRODUCT_ENQUIRY_CONTACT_METHODS,
  type ProductEnquiryContactMethod
} from "@/lib/api/product-enquiry-schema";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { useAsyncAction } from "@/hooks/use-async-action";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { cn } from "@/lib/utils";
import styles from "./product-enquiry-form.module.css";

export type ProductEnquiryFormProduct = {
  slug: string;
  name: string;
  sku: string;
  quantity: number;
  image?: string;
  productUrl?: string;
};

type ProductEnquiryFormProps = {
  product: ProductEnquiryFormProduct;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultRegion?: string;
  isGuest?: boolean;
  onSuccess?: () => void;
};

const CONTACT_METHOD_LABELS: Record<ProductEnquiryContactMethod, string> = {
  email: "Email",
  phone: "Phone call",
  whatsapp: "WhatsApp"
};

export function ProductEnquiryForm({
  product,
  defaultEmail = "",
  defaultPhone = "",
  defaultRegion = "India",
  isGuest = true,
  onSuccess
}: ProductEnquiryFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [company, setCompany] = useState("");
  const [preferredContactMethod, setPreferredContactMethod] = useState<ProductEnquiryContactMethod>("email");
  const [message, setMessage] = useState("");
  const { status, pending, run, setStatus } = useAsyncAction({ label: "Send product enquiry" });
  const [error, setError] = useState("");
  const [honeypot, setHoneypot] = useState("");

  function validateForm() {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Full name is required.");
      return false;
    }
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setError("Full name must be between 2 and 120 characters.");
      return false;
    }
    if (!isValidCustomerEmail(email.trim())) {
      setError("Enter a valid email address.");
      return false;
    }
    if (!isValidCustomerPhone(phone.trim())) {
      setError("Enter a valid phone number (8–15 digits).");
      return false;
    }
    return true;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!validateForm()) {
      setStatus("error");
      return;
    }

    setError("");

    try {
      const result = await run(async () => {
        const guestHeaders = isGuest ? await buildGuestRequestHeaders() : null;
        if (isGuest && !guestHeaders?.token) {
          return { ok: false as const, error: "Something went wrong. Refresh the page and try again." };
        }

        const region = defaultRegion.trim() || "India";
        const response = await fetchWithTimeout("/api/products/enquiry", {
          method: "POST",
          headers: guestHeaders?.headers ?? { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            company: company.trim() || null,
            region,
            country: region,
            productSlug: product.slug,
            productName: product.name,
            productSku: product.sku,
            preferredContactMethod,
            message: message.trim() || null,
            quantity: product.quantity,
            image: product.image ?? null,
            productUrl: product.productUrl ?? null,
            ...(honeypot.trim() ? { website: honeypot.trim() } : {})
          })
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          return {
            ok: false as const,
            error: typeof body.error === "string" ? body.error : "Failed to submit enquiry."
          };
        }

        const body = await response.json().catch(() => ({}));
        return {
          ok: true as const,
          enquiryId: typeof body.enquiryId === "string" ? body.enquiryId.trim() : ""
        };
      });

      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        setStatus("error");
        notify.error(result.error, { source: "enquiry" });
        return;
      }

      if (result.enquiryId) {
        notify.success(FEEDBACK_MESSAGES.productEnquirySent, { source: "enquiry" });
      }
      onSuccess?.();
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className={styles.success} data-product-enquiry-success>
        <p className={styles.successTitle}>Enquiry received.</p>
        <p className={styles.successBody}>
          Our team will respond about {product.name} via {CONTACT_METHOD_LABELS[preferredContactMethod].toLowerCase()} at {email} or {phone}.
        </p>
      </div>
    );
  }

  return (
    <form data-product-enquiry-form onSubmit={onSubmit} className={styles.form}>
      <p className={styles.hint}>{CUSTOMER_CONTACT_REQUIRED_MESSAGE}</p>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>
            Full name <span className={styles.required}>*</span>
          </span>
          <input
            required
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span>Company (optional)</span>
          <input
            type="text"
            autoComplete="organization"
            maxLength={160}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span>
            Phone number <span className={styles.required}>*</span>
          </span>
          <input
            required
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 98765 43210"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span>
            Email address <span className={styles.required}>*</span>
          </span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={styles.input}
          />
        </label>
      </div>

      <fieldset className={styles.segmentField}>
        <legend className={styles.segmentLegend}>
          Preferred contact method <span className={styles.required}>*</span>
        </legend>
        <div className={styles.segment} role="radiogroup" aria-label="Preferred contact method">
          {PRODUCT_ENQUIRY_CONTACT_METHODS.map((method) => {
            const active = preferredContactMethod === method;
            return (
              <label
                key={method}
                className={cn(styles.segmentOption, active && styles.segmentOptionActive)}
              >
                <input
                  type="radio"
                  name="preferredContactMethod"
                  value={method}
                  checked={active}
                  onChange={() => setPreferredContactMethod(method)}
                />
                <span>{CONTACT_METHOD_LABELS[method]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className={cn(styles.field, styles.fieldFull)}>
        <span>Additional notes (optional)</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Share timeline, quantity, and any special requirements."
          className={styles.textarea}
        />
      </label>

      <label className="sr-only" aria-hidden="true">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button type="submit" variant="accent" disabled={pending} className={styles.submit}>
          {pending ? "Sending..." : "Send Enquiry →"}
        </Button>
      </div>
    </form>
  );
}
