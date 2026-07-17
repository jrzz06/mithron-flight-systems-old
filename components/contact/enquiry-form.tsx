"use client";

import { useState } from "react";
import { isValidCustomerEmail, isValidCustomerPhone, CUSTOMER_CONTACT_REQUIRED_MESSAGE } from "@/lib/api/customer-contact";
import { buildGuestRequestHeaders } from "@/lib/api/client-audit-token-client";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { useAsyncAction } from "@/hooks/use-async-action";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnquiryFormProps = {
  defaultEmail?: string;
  defaultPhone?: string;
  defaultRegion?: string;
  isGuest?: boolean;
  auditToken?: string | null;
};

export function EnquiryForm({
  defaultEmail = "",
  defaultPhone = "",
  defaultRegion = "India",
  isGuest = true
}: EnquiryFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [region, setRegion] = useState(defaultRegion);
  const { status, pending, run, setStatus, reset } = useAsyncAction({ label: "Submit contact enquiry" });
  const [error, setError] = useState("");

  function validateContact() {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return false;
    }
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setError("Name must be between 2 and 120 characters.");
      return false;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return false;
    }
    if (!isValidCustomerEmail(email.trim())) {
      setError("Enter a valid email address.");
      return false;
    }
    if (!phone.trim()) {
      setError("Phone number is required.");
      return false;
    }
    if (!isValidCustomerPhone(phone.trim())) {
      setError("Enter a valid phone number (8–15 digits).");
      return false;
    }
    return true;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!validateContact()) {
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

        const response = await fetchWithTimeout("/api/contact-requests", {
          method: "POST",
          headers: guestHeaders?.headers ?? { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            subject,
            message,
            region
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
          contactRequestId:
            typeof body.contactRequestId === "string" ? body.contactRequestId.trim() : ""
        };
      });

      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        setStatus("error");
        notify.error(result.error, { source: "contact" });
        return;
      }
      // Honeypot responses return ok without an id — show success UI silently, never toast a fake ticket.
      if (result.contactRequestId) {
        notify.success(FEEDBACK_MESSAGES.contactSent, { source: "contact" });
      }
      setFullName("");
      setSubject("");
      setMessage("");
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6" data-enquiry-success>
        <p className="text-base font-semibold text-emerald-700">Enquiry received.</p>
        <p className="mt-2 text-sm text-emerald-800/80">Our team will respond to {email} or {phone} shortly.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={reset}>
          Send another enquiry
        </Button>
      </div>
    );
  }

  return (
    <form data-enquiry-form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-[clamp(1.25rem,4vw,1.5rem)]">
      <p className="text-sm text-slate-500">{CUSTOMER_CONTACT_REQUIRED_MESSAGE}</p>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Name <span className="text-red-600">*</span></span>
        <input
          required
          type="text"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Email <span className="text-red-600">*</span></span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Phone <span className="text-red-600">*</span></span>
        <input
          required
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+91 98765 43210"
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Subject <span className="text-red-600">*</span></span>
        <input
          required
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Region</span>
        <input
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-slate-400"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-slate-600">Message <span className="text-red-600">*</span></span>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-400"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Submit enquiry"}
      </Button>
    </form>
  );
}
