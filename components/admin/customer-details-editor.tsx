"use client";

import { useMemo, useState } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { wrapServerAction } from "@/hooks/use-async-action";

const fieldClass =
  "rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:border-[var(--platform-focus-border)]";

type CustomerDetailsEditorProps = {
  recordId: string;
  idFieldName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  updateDetails: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
};

export function CustomerDetailsEditor({
  recordId,
  idFieldName,
  fullName,
  email,
  phone,
  company,
  updateDetails,
  hiddenFields = {}
}: CustomerDetailsEditorProps) {
  const timedUpdateDetails = useMemo(
    () => wrapServerAction(updateDetails, { label: "Save customer details" }),
    [updateDetails]
  );
  const [fullNameValue, setFullNameValue] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone);
  const [companyValue, setCompanyValue] = useState(company);

  return (
    <section
      className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
      data-customer-details-editor
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
        Customer details
      </h3>
      <form action={timedUpdateDetails} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name={idFieldName} value={recordId} />
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--platform-text-muted)]">Email</span>
          <input value={email} readOnly className={`${fieldClass} opacity-80`} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-muted)]">Full name</span>
          <input
            name="customer_full_name"
            value={fullNameValue}
            onChange={(event) => setFullNameValue(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-muted)]">Phone</span>
          <input
            name="customer_phone"
            value={phoneValue}
            onChange={(event) => setPhoneValue(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--platform-text-muted)]">Company</span>
          <input
            name="customer_company"
            value={companyValue}
            onChange={(event) => setCompanyValue(event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="sm:col-span-2">
          <OperationalSubmitButton pendingLabel="Saving details">Save details</OperationalSubmitButton>
        </div>
      </form>
    </section>
  );
}
