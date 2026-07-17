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
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6" data-product-enquiry-success>
        <p className="text-base font-semibold text-emerald-700">Enquiry received.</p>
        <p className="mt-2 text-sm text-emerald-800/80">
          Our team will respond about {product.name} via {CONTACT_METHOD_LABELS[preferredContactMethod].toLowerCase()} at {email} or {phone}.
        </p>
      </div>
    );
  }

  return (
    <form data-product-enquiry-form onSubmit={onSubmit} className="grid gap-4">
      <p className="text-sm text-slate-500">{CUSTOMER_CONTACT_REQUIRED_MESSAGE}</p>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Product name</span>
        <input
          readOnly
          value={product.name}
          className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-700"
        />
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Product SKU</span>
        <input
          readOnly
          value={product.sku}
          className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-700"
        />
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Full name <span className="text-red-600">*</span></span>
        <input
          required
          type="text"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Phone number <span className="text-red-600">*</span></span>
        <input
          required
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+91 98765 43210"
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Email address <span className="text-red-600">*</span></span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Company (optional)</span>
        <input
          type="text"
          autoComplete="organization"
          maxLength={160}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>

      <fieldset className="grid gap-2 text-sm">
        <legend className="font-medium text-slate-600">Preferred contact method <span className="text-red-600">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRODUCT_ENQUIRY_CONTACT_METHODS.map((method) => (
            <label
              key={method}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
            >
              <input
                type="radio"
                name="preferredContactMethod"
                value={method}
                checked={preferredContactMethod === method}
                onChange={() => setPreferredContactMethod(method)}
                className="size-4 accent-slate-900"
              />
              <span>{CONTACT_METHOD_LABELS[method]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Additional notes (optional)</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Share timeline, quantity, and any special requirements."
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-400"
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" variant="accent" disabled={pending} className="min-h-12">
        {pending ? "Sending..." : "Send enquiry"}
      </Button>
    </form>
  );
}
