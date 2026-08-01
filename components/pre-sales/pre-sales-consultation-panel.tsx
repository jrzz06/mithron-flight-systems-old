"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./pre-sales-consultation.module.css";

export const PRE_SALES_INQUIRY_TYPES = [
  "Purchase Related",
  "Bulk Order",
  "Sales",
  "Services",
  "Academic",
  "Development",
  "Loan / Financing"
] as const;

export const PRE_SALES_LANGUAGES = ["English", "Tamil", "Hindi"] as const;

export type PreSalesConsultationValues = {
  inquiryType: string;
  preferredLanguage: string;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
};

export type PreSalesConsultationPanelProps = {
  open: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSubmit: (values: PreSalesConsultationValues) => void | Promise<void>;
  variant?: "storefront" | "checkout";
  /** Compact corner card — non-blocking, used on storefront. */
  compact?: boolean;
  productSummary?: string;
  defaults?: Partial<PreSalesConsultationValues>;
  /** Sync contact fields back to parent (checkout shares these with the form). */
  onValuesChange?: (values: PreSalesConsultationValues) => void;
  submitting?: boolean;
  error?: string | null;
  successReference?: string | null;
  timerSeconds?: number;
};

const TIMER_DEFAULT = 10;

const STOREFRONT_SUBTEXT =
  "Talk with our flight engineering team about fit, configuration, or next steps. Share a few details — optional, no commitment required.";

const COMPACT_SUBTEXT = "Questions about fit or next steps? Leave a few details.";

const CHECKOUT_SUBTEXT =
  "Thank you for choosing Mithron Drone Systems. To help us address your requirements, please share your details below. Our flight engineering team will contact you shortly.";

export function formatPreSalesInquiryTag(inquiryType: string, preferredLanguage: string) {
  return `[Inquiry: ${inquiryType} | Language: ${preferredLanguage}]`;
}

export function PreSalesConsultationPanel({
  open,
  onClose,
  onCancel,
  onSubmit,
  variant = "storefront",
  compact = false,
  productSummary,
  defaults,
  onValuesChange,
  submitting = false,
  error = null,
  successReference = null,
  timerSeconds = TIMER_DEFAULT
}: PreSalesConsultationPanelProps) {
  const titleId = useId();
  const gradientId = useId().replace(/:/g, "");
  const [mounted, setMounted] = useState(false);
  const [modalTimer, setModalTimer] = useState(timerSeconds);
  const [inquiryType, setInquiryType] = useState(defaults?.inquiryType ?? "Purchase Related");
  const [preferredLanguage, setPreferredLanguage] = useState(defaults?.preferredLanguage ?? "English");
  const [fullName, setFullName] = useState(defaults?.fullName ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [timerPaused, setTimerPaused] = useState(false);
  const interactingRef = useRef(false);
  const hasTypedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const readValues = useCallback(
    (): PreSalesConsultationValues => ({
      inquiryType,
      preferredLanguage,
      fullName,
      email,
      phone,
      notes
    }),
    [email, fullName, inquiryType, notes, phone, preferredLanguage]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setModalTimer(timerSeconds);
    interactingRef.current = false;
    hasTypedRef.current = false;
    setTimerPaused(false);
    setInquiryType(defaults?.inquiryType ?? "Purchase Related");
    setPreferredLanguage(defaults?.preferredLanguage ?? "English");
    setFullName(defaults?.fullName ?? "");
    setEmail(defaults?.email ?? "");
    setPhone(defaults?.phone ?? "");
    setNotes(defaults?.notes ?? "");
    // Seed once per open — do not re-sync from parent defaults while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-only seed
  }, [open, timerSeconds]);

  useEffect(() => {
    if (!open || successReference) return;

    const interval = setInterval(() => {
      if (interactingRef.current || hasTypedRef.current || submitting) return;
      setModalTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Defer parent setState — calling onClose inside this updater runs during
          // render and triggers "Cannot update a component while rendering a different component".
          queueMicrotask(() => {
            onCloseRef.current();
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open, submitting, successReference]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        (onCancel ?? onClose)();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    if (compact) {
      return () => {
        window.removeEventListener("keydown", onKeyDown);
      };
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel, onClose, submitting, compact]);

  function emitChange(next: PreSalesConsultationValues) {
    onValuesChange?.(next);
  }

  function markInteraction() {
    interactingRef.current = true;
    setTimerPaused(true);
  }

  function clearInteraction() {
    interactingRef.current = false;
    if (!hasTypedRef.current) setTimerPaused(false);
  }

  function markTyped() {
    hasTypedRef.current = true;
    setTimerPaused(true);
  }

  async function handleSubmit() {
    if (submitting) return;
    await onSubmit(readValues());
  }

  function dismiss() {
    if (submitting) return;
    (onCancel ?? onClose)();
  }

  if (!mounted || !open) return null;

  const summaryLabel = productSummary?.trim() || (variant === "checkout" ? "Drone System" : "General consultation");
  const primaryId = `preSalesEmeraldWaterPrimary-${gradientId}`;
  const secondaryId = `preSalesEmeraldWaterSecondary-${gradientId}`;
  const tertiaryId = `preSalesEmeraldWaterTertiary-${gradientId}`;
  const subtext =
    compact ? COMPACT_SUBTEXT : variant === "checkout" ? CHECKOUT_SUBTEXT : STOREFRONT_SUBTEXT;

  return createPortal(
    <div
      className={cn(styles.overlay, compact && styles.overlayCompact)}
      role="presentation"
      onClick={compact ? undefined : dismiss}
    >
      <div
        ref={cardRef}
        className={cn(styles.card, compact && styles.cardCompact)}
        role="dialog"
        aria-modal={compact ? undefined : "true"}
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close pre-sales consultation"
          disabled={submitting}
          onClick={dismiss}
        >
          <X className={styles.closeIcon} aria-hidden="true" strokeWidth={2.25} />
        </button>

        {!successReference ? (
          <div className={styles.waterWaveTrack}>
            <div
              className={styles.waterWaveFill}
              style={{ width: `${(modalTimer / timerSeconds) * 100}%` }}
            >
              <svg className={styles.waterWaveSvg} viewBox="0 0 1200 48" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={primaryId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1f6b46" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                  <linearGradient id={secondaryId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(34, 197, 94, 0.75)" />
                    <stop offset="100%" stopColor="rgba(52, 211, 153, 0.45)" />
                  </linearGradient>
                  <linearGradient id={tertiaryId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(16, 185, 129, 0.35)" />
                    <stop offset="100%" stopColor="rgba(220, 252, 231, 0.18)" />
                  </linearGradient>
                </defs>
                <path
                  className={styles.waterWavePath3}
                  style={{ fill: `url(#${tertiaryId})` }}
                  d="M0,28 C200,48 400,8 600,28 C800,48 1000,8 1200,28 L1200,0 L0,0 Z"
                />
                <path
                  className={styles.waterWavePath2}
                  style={{ fill: `url(#${secondaryId})` }}
                  d="M0,22 C180,-2 360,42 540,22 C720,-2 900,42 1080,22 C1140,12 1200,22 1200,22 L1200,0 L0,0 Z"
                />
                <path
                  className={styles.waterWavePath1}
                  style={{ fill: `url(#${primaryId})` }}
                  d="M0,18 C150,34 300,2 450,18 C600,34 750,2 900,18 C1050,34 1200,18 1200,18 L1200,0 L0,0 Z"
                />
              </svg>
            </div>
          </div>
        ) : null}

        {successReference ? (
          <div className={styles.success}>
            <h2 id={titleId} className={styles.successTitle}>
              Request received
            </h2>
            <p className={styles.successBody}>
              Thanks — our team will follow up shortly. Reference: <strong>{successReference}</strong>
            </p>
            <div className={styles.footer} style={{ justifyContent: "center" }}>
              <button type="button" className={styles.submitBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.scrollRegion}>
              <div className={styles.header}>
                <h2 id={titleId} className={styles.title}>
                  Pre-Sales Consultation
                </h2>
                <p className={styles.subtext}>{subtext}</p>
              </div>

              <div className={styles.body}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`pre-sales-inquiry-${gradientId}`}>
                    Type of your inquiry*
                  </label>
                  <select
                    id={`pre-sales-inquiry-${gradientId}`}
                    value={inquiryType}
                    className={styles.select}
                    onFocus={markInteraction}
                    onBlur={clearInteraction}
                    onChange={(event) => {
                      markTyped();
                      const next = { ...readValues(), inquiryType: event.target.value };
                      setInquiryType(event.target.value);
                      emitChange(next);
                    }}
                  >
                    {PRE_SALES_INQUIRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.gridTwo}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`pre-sales-lang-${gradientId}`}>
                      Preferred Contact Language
                    </label>
                    <select
                      id={`pre-sales-lang-${gradientId}`}
                      value={preferredLanguage}
                      className={styles.select}
                      onFocus={markInteraction}
                      onBlur={clearInteraction}
                      onChange={(event) => {
                        markTyped();
                        const next = { ...readValues(), preferredLanguage: event.target.value };
                        setPreferredLanguage(event.target.value);
                        emitChange(next);
                      }}
                    >
                      {PRE_SALES_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`pre-sales-summary-${gradientId}`}>
                      Product Summary
                    </label>
                    <input
                      id={`pre-sales-summary-${gradientId}`}
                      type="text"
                      readOnly
                      value={summaryLabel}
                      className={cn(styles.input, styles.inputReadonly)}
                    />
                  </div>
                </div>

                <div className={styles.gridTwo}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`pre-sales-name-${gradientId}`}>
                      Your name*
                    </label>
                    <input
                      id={`pre-sales-name-${gradientId}`}
                      type="text"
                      value={fullName}
                      placeholder="Enter your name"
                      className={styles.input}
                      autoComplete="name"
                      onFocus={markInteraction}
                      onBlur={clearInteraction}
                      onChange={(event) => {
                        markTyped();
                        const next = { ...readValues(), fullName: event.target.value };
                        setFullName(event.target.value);
                        emitChange(next);
                      }}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`pre-sales-email-${gradientId}`}>
                      Your email address*
                    </label>
                    <input
                      id={`pre-sales-email-${gradientId}`}
                      type="email"
                      value={email}
                      placeholder="Enter your email"
                      className={styles.input}
                      autoComplete="email"
                      onFocus={markInteraction}
                      onBlur={clearInteraction}
                      onChange={(event) => {
                        markTyped();
                        const next = { ...readValues(), email: event.target.value };
                        setEmail(event.target.value);
                        emitChange(next);
                      }}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`pre-sales-phone-${gradientId}`}>
                    Mobile number*
                  </label>
                  <input
                    id={`pre-sales-phone-${gradientId}`}
                    type="tel"
                    value={phone}
                    placeholder="Enter mobile number"
                    className={styles.input}
                    autoComplete="tel"
                    onFocus={markInteraction}
                    onBlur={clearInteraction}
                    onChange={(event) => {
                      markTyped();
                      const next = { ...readValues(), phone: event.target.value };
                      setPhone(event.target.value);
                      emitChange(next);
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`pre-sales-notes-${gradientId}`}>
                    Specific notes or requirements
                  </label>
                  <textarea
                    id={`pre-sales-notes-${gradientId}`}
                    value={notes}
                    placeholder={
                      compact
                        ? "Quantity, timeline, or questions…"
                        : "Share quantity, delivery timeline, or custom questions..."
                    }
                    className={styles.textarea}
                    rows={compact ? 2 : 3}
                    onFocus={markInteraction}
                    onBlur={clearInteraction}
                    onChange={(event) => {
                      markTyped();
                      const next = { ...readValues(), notes: event.target.value };
                      setNotes(event.target.value);
                      emitChange(next);
                    }}
                  />
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}
              </div>
            </div>

            <div className={styles.actions}>
              <div className={styles.footer}>
                <button type="button" className={styles.cancelBtn} disabled={submitting} onClick={dismiss}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.submitBtn}
                  disabled={submitting}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? "Submitting…" : "Submit Enquiry"}
                </button>
              </div>
              <p className={styles.timerHint}>
                {timerPaused ? "Timer paused while you edit" : `Auto-closing in ${modalTimer}s`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
