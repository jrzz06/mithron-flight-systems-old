"use client";

import { FormEvent, useMemo, useState, useActionState, useEffect } from "react";
import { notify } from "@/lib/feedback/notify";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  splitE164ToCountry,
  validateCustomerName,
  validatePhoneWithCountry
} from "@/lib/api/customer-contact";
import { PhoneCountryField } from "@/components/auth/phone-country-field";
import { wrapServerAction } from "@/hooks/use-async-action";
import {
  completeProfileFormAction,
  type CompleteProfileFormState
} from "./actions";
import styles from "./complete-profile.module.css";

const initialState: CompleteProfileFormState = { ok: false };
const timedCompleteProfile = wrapServerAction(completeProfileFormAction, { label: "Complete profile" });

export function CompleteProfileForm({
  email,
  displayName,
  phone,
  nextPath,
  nameAlreadyValid: nameAlreadyValidProp
}: {
  email: string;
  displayName: string;
  phone: string;
  nextPath: string;
  nameAlreadyValid?: boolean;
}) {
  const nameAlreadyValid = useMemo(
    () => nameAlreadyValidProp ?? validateCustomerName(displayName).ok,
    [displayName, nameAlreadyValidProp]
  );
  const initialPhone = useMemo(() => splitE164ToCountry(phone), [phone]);
  const [step, setStep] = useState<1 | 2>(nameAlreadyValid ? 2 : 1);
  const [fullName, setFullName] = useState(displayName);
  const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhone.countryCode || DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNational, setPhoneNational] = useState(initialPhone.national);
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(timedCompleteProfile, initialState);

  const composedPhone = useMemo(() => {
    const result = validatePhoneWithCountry(phoneCountryCode, phoneNational);
    return result.ok ? result.value : "";
  }, [phoneCountryCode, phoneNational]);

  useEffect(() => {
    if (!state.error) return;
    notify.error(state.error, { source: "account", id: "complete-profile:error" });
  }, [state.error]);

  function continueFromName(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const nameResult = validateCustomerName(fullName);
    if (!nameResult.ok) {
      setLocalError(nameResult.error);
      return;
    }
    setFullName(nameResult.value);
    setStep(2);
  }

  function submitPhone(event: FormEvent<HTMLFormElement>) {
    setLocalError(null);
    const phoneResult = validatePhoneWithCountry(phoneCountryCode, phoneNational);
    if (!phoneResult.ok) {
      event.preventDefault();
      setLocalError(phoneResult.error);
    }
  }

  const alertError = localError || state.error || null;
  const phoneOnly = nameAlreadyValid;

  return (
    <div
      className={styles.card}
      data-testid="complete-profile-form"
      data-profile-step={step}
      data-phone-only={phoneOnly ? "true" : "false"}
    >
      <p className={styles.brand}>Mithron</p>
      <h1 className={styles.title}>
        {phoneOnly ? "Almost there" : step === 1 ? "Welcome" : "One more detail"}
      </h1>
      <p className={styles.lead}>
        {phoneOnly
          ? "Add a phone number so we can reach you about orders and enquiries. Your Google email is already set."
          : step === 1
            ? "Tell us how to address you — then a phone number so we can follow up on your requests."
            : "Add a phone number so we can reach you about orders and enquiries."}
      </p>

      <p className={styles.stepHint} data-testid="complete-profile-step-hint">
        {phoneOnly
          ? "Phone number"
          : step === 1
            ? "Your name"
            : "Phone number"}
      </p>

      <div className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          value={email}
          readOnly
          disabled
          aria-readonly="true"
          data-testid="complete-profile-email"
        />
        <p className={styles.emailNote}>Signed in with this email — no need to change it.</p>
      </div>

      {step === 1 ? (
        <form onSubmit={continueFromName} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Your name</span>
            <input
              className={styles.input}
              name="full_name_preview"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              required
              data-testid="complete-profile-name"
            />
          </label>
          {alertError ? (
            <p className={styles.error} role="alert">
              {alertError}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              Continue
            </button>
          </div>
        </form>
      ) : (
        <form action={formAction} onSubmit={submitPhone} className={styles.form}>
          <input type="hidden" name="next" value={nextPath} />
          <input type="hidden" name="full_name" value={fullName} />
          <input type="hidden" name="phone" value={composedPhone} />
          {!phoneOnly ? (
            <div className={styles.field}>
              <span className={styles.label}>Your name</span>
              <input
                className={styles.input}
                value={fullName}
                readOnly
                disabled
                aria-readonly="true"
              />
            </div>
          ) : null}
          <div className={styles.field}>
            <span className={styles.label}>Phone number</span>
            <PhoneCountryField
              countryCode={phoneCountryCode}
              national={phoneNational}
              onCountryChange={setPhoneCountryCode}
              onNationalChange={setPhoneNational}
              selectClassName={styles.input}
              inputClassName={styles.input}
              data-testid="complete-profile-phone"
            />
          </div>
          {alertError ? (
            <p className={styles.error} role="alert">
              {alertError}
            </p>
          ) : null}
          <div className={styles.actions}>
            {!nameAlreadyValid ? (
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => {
                  setLocalError(null);
                  setStep(1);
                }}
              >
                Back
              </button>
            ) : null}
            <button
              type="submit"
              className={styles.primary}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Saving…" : "Continue to Mithron"}
            </button>
          </div>
          <p className={styles.reassure}>
            We only ask for name, phone, and email — the same details used for enquiries.
          </p>
        </form>
      )}
    </div>
  );
}
