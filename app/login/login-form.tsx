"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { recordClientAuthEvent } from "@/lib/auth/audit-client";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { GUEST_AUTH_HOME } from "@/lib/auth/guest-auth";
import { resolveClientAuthRedirectPath, unwrapAuthNextPath } from "@/lib/auth/redirects";
import { resolveClientAuthOrigin } from "@/lib/site-url";
import {
  PASSWORD_RULES_HINT,
  normalizeSignupEmail,
  validateSignupEmail,
  validateSignupFullName,
  validateSignupPassword,
  validateSignupPhoneWithCountry
} from "@/lib/auth/signup-validation";
import { hasSocialSignIn, type AuthProviderAvailability } from "@/lib/auth/provider-registry";
import { DEFAULT_PHONE_COUNTRY_CODE } from "@/lib/api/customer-contact";
import { PhoneCountryField } from "@/components/auth/phone-country-field";
import { useOptionalGlobalBusy } from "@/components/ui/global-busy";
import { createClient } from "@/lib/client";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { fetchWithTimeout, raceWithTimeout } from "@/lib/fetch-with-timeout";
import styles from "./login.module.css";

export type AuthFormMode = "signin" | "signup";

type LoginFormProps = {
  nextPath: string;
  initialMode?: AuthFormMode;
  inviteToken?: string | null;
  auditToken?: string | null;
  providers: AuthProviderAvailability;
};

type FormStatus =
  | "idle"
  | "submitting"
  | "google"
  | "resending"
  | "sending_otp"
  | "verifying_otp";

const OTP_LENGTH = 8;

function buildOAuthCallbackUrl(nextPath: string) {
  const callback = new URL("/auth/callback", resolveClientAuthOrigin());
  // Unwrap once — never forward a nested `next` into the OAuth callback URL.
  callback.searchParams.set("next", unwrapAuthNextPath(nextPath, GUEST_AUTH_HOME));
  return callback.toString();
}

function GoogleIcon() {
  return (
    <svg className={styles.methodIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg className={styles.toggleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
        <path d="M4 4l16 16" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={styles.toggleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PasswordField({
  id,
  toggleId,
  label,
  value,
  onChange,
  showPassword,
  onTogglePassword,
  autoComplete,
  hasError,
  required = true
}: {
  id: string;
  toggleId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  autoComplete: string;
  hasError: boolean;
  required?: boolean;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={`${styles.labelText} ${label === "Password" ? styles.labelTextPassword : ""}`}>{label}</span>
      <div className={styles.passwordField}>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          className={styles.authInput}
          aria-invalid={hasError || undefined}
        />
        <button
          type="button"
          id={toggleId}
          className={styles.passwordToggle}
          onClick={onTogglePassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          aria-controls={id}
        >
          <EyeIcon hidden={showPassword} />
        </button>
      </div>
    </label>
  );
}

function OtpInput({
  value,
  onChange,
  disabled,
  id
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function focusIndex(index: number) {
    inputRefs.current[index]?.focus();
  }

  function applyDigits(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length < OTP_LENGTH) {
      focusIndex(digits.length);
    } else {
      inputRefs.current[OTP_LENGTH - 1]?.blur();
    }
  }

  function handleChange(index: number, nextValue: string) {
    const digit = nextValue.replace(/\D/g, "").slice(-1);
    const chars = value.padEnd(OTP_LENGTH, " ").split("");
    chars[index] = digit || " ";
    const next = chars.join("").trimEnd().replace(/\s/g, "");
    onChange(next.slice(0, OTP_LENGTH));
    if (digit && index < OTP_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      focusIndex(index - 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    applyDigits(event.clipboardData.getData("text"));
  }

  return (
    <div className={styles.otpRow} data-testid="auth-otp-input" id={id}>
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={value[index] ?? ""}
          disabled={disabled}
          className={styles.otpDigit}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}

function VerificationPendingPanel({
  email,
  busy,
  message,
  otpCode,
  changeEmailMode,
  newEmail,
  onOtpChange,
  onVerify,
  onResend,
  onStartChangeEmail,
  onCancelChangeEmail,
  onNewEmailChange,
  onSubmitChangeEmail
}: {
  email: string;
  busy: boolean;
  message: string | null;
  otpCode: string;
  changeEmailMode: boolean;
  newEmail: string;
  onOtpChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onStartChangeEmail: () => void;
  onCancelChangeEmail: () => void;
  onNewEmailChange: (value: string) => void;
  onSubmitChangeEmail: () => void;
}) {
  if (changeEmailMode) {
    return (
      <div className={styles.verificationPanel} data-testid="auth-change-email-panel">
        <p className={styles.verificationCopy}>
          Enter the correct email address. We will send a new verification code to that inbox.
        </p>
        <label className={styles.field}>
          <span className={styles.labelText}>New email address</span>
          <input
            value={newEmail}
            onChange={(event) => onNewEmailChange(event.target.value)}
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            className={styles.authInput}
            data-testid="auth-change-email-input"
          />
        </label>
        {message ? <p className={styles.verificationNotice} role="status">{message}</p> : null}
        <div className={styles.verificationActions}>
          <button
            type="button"
            className={styles.authSubmit}
            disabled={busy || !normalizeSignupEmail(newEmail)}
            onClick={onSubmitChangeEmail}
            data-testid="auth-change-email-submit"
          >
            {busy ? "Updating…" : "Update email and resend code"}
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={busy}
            onClick={onCancelChangeEmail}
            data-testid="auth-change-email-cancel"
          >
            Back to verification
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.verificationPanel} data-testid="auth-verification-pending">
      <p className={styles.verificationCopy}>
        We emailed an 8-digit code to <strong>{email}</strong>. Enter it below, or open the link in that email.
      </p>
      <OtpInput value={otpCode} onChange={onOtpChange} disabled={busy} />
      <p className={styles.otpHint}>Codes are sent by email only — check inbox and spam if it takes a moment.</p>
      {message ? <p className={styles.verificationNotice} role="status">{message}</p> : null}
      <div className={styles.verificationActions}>
        <button
          type="button"
          className={styles.authSubmit}
          disabled={busy || otpCode.length !== OTP_LENGTH}
          onClick={onVerify}
          data-testid="auth-verify-otp"
        >
          {busy ? "Verifying…" : "Verify email"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={onResend}
          data-testid="auth-resend-verification"
        >
          {busy ? "Sending…" : "Resend code"}
        </button>
        <button
          type="button"
          className={styles.textButton}
          disabled={busy}
          onClick={onStartChangeEmail}
          data-testid="auth-change-email"
        >
          Change email
        </button>
      </div>
    </div>
  );
}

export function LoginForm({
  nextPath,
  initialMode = "signin",
  inviteToken = null,
  auditToken = null,
  providers
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const socialEnabled = hasSocialSignIn(providers);
  const isMountedRef = useRef(false);

  const emailFieldId = useId();
  const passwordFieldId = useId();
  const confirmPasswordFieldId = useId();
  const fullNameFieldId = useId();
  const phoneFieldId = useId();
  const passwordToggleId = useId();
  const confirmPasswordToggleId = useId();

  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [verificationPending, setVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [signInOtpMode, setSignInOtpMode] = useState(false);
  const [signInOtpSent, setSignInOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNational, setPhoneNational] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeEmailMode, setChangeEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const busyCtx = useOptionalGlobalBusy();
  const beginBusy = busyCtx?.beginBusy;
  const endBusy = busyCtx?.endBusy;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!beginBusy || !endBusy) return;
    const id = "auth";
    if (status !== "idle") beginBusy(id);
    else endBusy(id);
    return () => endBusy(id);
  }, [beginBusy, endBusy, status]);

  useEffect(() => {
    if (!redirectTo) return;
    notify.success(mode === "signup" ? FEEDBACK_MESSAGES.registered : FEEDBACK_MESSAGES.loggedIn, {
      source: "auth",
      id: `auth:redirect:${mode}`
    });
    window.location.assign(redirectTo);

    // If full-page navigation stalls (blocked popup, hung browser, etc.), never leave
    // auth buttons permanently busy — surface a recoverable error after a bounded wait.
    const fallbackTimer = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setStatus("idle");
      setError("Redirect is taking longer than expected. Tap Continue to open your destination.");
      setNotice(null);
    }, 8_000);

    return () => window.clearTimeout(fallbackTimer);
  }, [mode, redirectTo]);

  useEffect(() => {
    if (!error?.trim()) return;
    notify.error(error, { source: "auth", id: `auth:error:${error}` });
  }, [error]);

  function switchMode(nextMode: AuthFormMode) {
    setMode(nextMode);
    setSignupStep(1);
    setError(null);
    setNotice(null);
    setVerificationPending(false);
    setChangeEmailMode(false);
    setNewEmail("");
    setSignInOtpMode(false);
    setSignInOtpSent(false);
    setOtpCode("");

    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "signup") {
      params.set("mode", "signup");
    } else {
      params.delete("mode");
    }
    const query = params.toString();
    router.replace(query ? `/login?${query}` : "/login", { scroll: false });
  }

  function advanceSignupStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (signupStep === 1) {
      const nameResult = validateSignupFullName(fullName);
      if (!nameResult.ok) {
        setError(nameResult.error);
        return;
      }
      setSignupStep(2);
      return;
    }

    if (signupStep === 2) {
      const emailResult = validateSignupEmail(email);
      if (!emailResult.ok) {
        setError(emailResult.error);
        return;
      }
      const phoneResult = validateSignupPhoneWithCountry(phoneCountryCode, phoneNational);
      if (!phoneResult.ok) {
        setError(phoneResult.error);
        return;
      }
      setSignupStep(3);
    }
  }

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isMountedRef.current) return;

    const normalizedEmail = normalizeSignupEmail(email);
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auditToken ? { "x-auth-audit-token": auditToken } : {})
        },
        body: JSON.stringify({ email: normalizedEmail, password, next: nextPath }),
        credentials: "same-origin"
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        code?: string;
        email?: string;
        redirectPath?: string;
      };

      if (!isMountedRef.current) return;

      if (response.status === 403 && payload.code === "verification_pending") {
        setPendingEmail(typeof payload.email === "string" ? payload.email : normalizedEmail);
        setVerificationPending(true);
        setStatus("idle");
        setError(null);
        return;
      }

      if (!response.ok) {
        const mappedError = mapAuthErrorForClient(payload.error);
        if (mappedError === "Please verify your email before signing in.") {
          setPendingEmail(typeof payload.email === "string" ? payload.email : normalizedEmail);
          setVerificationPending(true);
          setOtpCode("");
          setStatus("idle");
          setError(null);
          return;
        }

        await recordClientAuthEvent("auth.failed_login", {
          email: normalizedEmail,
          error: typeof payload.error === "string" ? payload.error : "Sign in failed.",
          provider: "email"
        }, auditToken);
        setStatus("idle");
        setError(mapAuthErrorForClient(payload.error));
        return;
      }

      setRedirectTo(resolveClientAuthRedirectPath(payload.redirectPath));
    } catch (authError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      setError(mapAuthErrorForClient(authError));
    }
  }

  async function submitSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isMountedRef.current) return;

    const nameResult = validateSignupFullName(fullName);
    if (!nameResult.ok) {
      setError(nameResult.error);
      setSignupStep(1);
      return;
    }

    const emailResult = validateSignupEmail(email);
    if (!emailResult.ok) {
      setError(emailResult.error);
      setSignupStep(2);
      return;
    }

    const phoneResult = validateSignupPhoneWithCountry(phoneCountryCode, phoneNational);
    if (!phoneResult.ok) {
      setError(phoneResult.error);
      setSignupStep(2);
      return;
    }

    const passwordResult = validateSignupPassword(password, confirmPassword);
    if (!passwordResult.ok) {
      setError(passwordResult.error);
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetchWithTimeout("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: nameResult.value,
          email: emailResult.value,
          password,
          confirmPassword,
          phone: phoneResult.value,
          inviteToken
        })
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        email?: string;
        code?: string;
      };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        if (response.status === 409 && payload.code === "already_registered") {
          setStatus("idle");
          setError(payload.error ?? "An account with this email already exists. Log in instead.");
          setEmail(emailResult.value);
          switchMode("signin");
          return;
        }

        if (inviteToken) {
          await recordClientAuthEvent("auth.invite_accept", {
            outcome: "failed",
            invite_token_present: true,
            error: payload.error ?? "Request failed",
            provider: "supabase"
          });
        }
        setStatus("idle");
        setError(payload.error ?? "Unable to create account. Please try again.");
        return;
      }

      if (inviteToken) {
        await recordClientAuthEvent("auth.invite_accept", {
          outcome: "submitted",
          invite_token_present: true,
          provider: "supabase"
        });
      }

      setPendingEmail(typeof payload.email === "string" ? payload.email : emailResult.value);
      setVerificationPending(true);
      setChangeEmailMode(false);
      setNewEmail("");
      setOtpCode("");
      setStatus("idle");
      setNotice(null);
    } catch (signupError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      setError(mapAuthErrorForClient(signupError));
    }
  }

  async function resendVerification() {
    if (!pendingEmail || !isMountedRef.current) return;
    setStatus("resending");
    setNotice(null);

    try {
      const response = await fetchWithTimeout("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, purpose: "signup" })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const message = payload.error ?? "Unable to resend verification code.";
        setStatus("idle");
        setNotice(message);
        notify.error(message, { source: "auth", id: "otp:resend:error" });
        return;
      }

      setStatus("idle");
      setNotice("Code sent — check your inbox (and spam) if it is not there yet.");
      notify.success(FEEDBACK_MESSAGES.otpSent, { source: "auth", id: "otp:resend:success" });
    } catch {
      if (!isMountedRef.current) return;
      setStatus("idle");
      setNotice("Unable to resend verification code.");
      notify.error(FEEDBACK_MESSAGES.otpFailed, { source: "auth", id: "otp:resend:catch" });
    }
  }

  async function verifySignupOtp() {
    if (!pendingEmail || otpCode.length !== OTP_LENGTH || !isMountedRef.current) return;
    setStatus("verifying_otp");
    setNotice(null);

    try {
      const response = await fetchWithTimeout("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingEmail,
          token: otpCode,
          type: "signup",
          next: nextPath
        }),
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        redirectPath?: string;
      };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const message = payload.error ?? "Verification failed. Please try again.";
        setStatus("idle");
        setNotice(message);
        notify.error(FEEDBACK_MESSAGES.otpFailed, { source: "auth", id: "otp:verify-signup:error" });
        return;
      }

      notify.success(FEEDBACK_MESSAGES.otpVerified, { source: "auth", id: "otp:verify-signup:success" });
      setRedirectTo(resolveClientAuthRedirectPath(payload.redirectPath));
    } catch (verifyError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      const message = mapAuthErrorForClient(verifyError);
      setNotice(message);
      notify.error(FEEDBACK_MESSAGES.otpFailed, { source: "auth", id: "otp:verify-signup:catch" });
    }
  }

  async function sendSignInOtp() {
    const normalizedEmail = normalizeSignupEmail(email);
    if (!normalizedEmail || !isMountedRef.current) return;

    setStatus("sending_otp");
    setError(null);
    setNotice(null);

    try {
      const response = await fetchWithTimeout("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, purpose: "signin" })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const message = payload.error ?? "Unable to send sign-in code.";
        setStatus("idle");
        setError(message);
        notify.error(message, { source: "auth", id: "otp:send-signin:error" });
        return;
      }

      setSignInOtpSent(true);
      setOtpCode("");
      setStatus("idle");
      setNotice("Code sent — check your inbox (and spam) if it is not there yet.");
      notify.success(FEEDBACK_MESSAGES.otpSent, { source: "auth", id: "otp:send-signin:success" });
    } catch (sendError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      const message = mapAuthErrorForClient(sendError);
      setError(message);
      notify.error(message, { source: "auth", id: "otp:send-signin:catch" });
    }
  }

  async function verifySignInOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = normalizeSignupEmail(email);
    if (!normalizedEmail || otpCode.length !== OTP_LENGTH || !isMountedRef.current) return;

    setStatus("verifying_otp");
    setError(null);

    try {
      const response = await fetchWithTimeout("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          token: otpCode,
          type: "email",
          next: nextPath
        }),
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        redirectPath?: string;
      };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const message = mapAuthErrorForClient(payload.error);
        setStatus("idle");
        setError(message);
        notify.error(FEEDBACK_MESSAGES.otpFailed, { source: "auth", id: "otp:verify-signin:error" });
        return;
      }

      notify.success(FEEDBACK_MESSAGES.otpVerified, { source: "auth", id: "otp:verify-signin:success" });
      setRedirectTo(resolveClientAuthRedirectPath(payload.redirectPath));
    } catch (verifyError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      const message = mapAuthErrorForClient(verifyError);
      setError(message);
      notify.error(FEEDBACK_MESSAGES.otpFailed, { source: "auth", id: "otp:verify-signin:catch" });
    }
  }

  function startChangeEmail() {
    setChangeEmailMode(true);
    setNewEmail("");
    setOtpCode("");
    setNotice(null);
    setError(null);
  }

  function cancelChangeEmail() {
    setChangeEmailMode(false);
    setNewEmail("");
    setNotice(null);
    setError(null);
  }

  async function submitChangeEmail() {
    const normalizedNewEmail = normalizeSignupEmail(newEmail);
    if (!pendingEmail || !normalizedNewEmail || !isMountedRef.current) return;

    if (normalizedNewEmail === pendingEmail) {
      setNotice("Enter a different email address.");
      return;
    }

    setStatus("submitting");
    setNotice(null);
    setError(null);

    try {
      const response = await fetchWithTimeout("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentEmail: pendingEmail,
          newEmail: normalizedNewEmail
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; email?: string };

      if (!isMountedRef.current) return;

      if (!response.ok) {
        const message = payload.error ?? "Unable to update email. Please try again.";
        setStatus("idle");
        setNotice(message);
        notify.error(message, { source: "auth", id: "change-email:error" });
        return;
      }

      const updatedEmail = typeof payload.email === "string" ? payload.email : normalizedNewEmail;
      setPendingEmail(updatedEmail);
      setEmail(updatedEmail);
      setChangeEmailMode(false);
      setNewEmail("");
      setOtpCode("");
      setStatus("idle");
      setNotice(`Code sent to ${updatedEmail} — check inbox and spam if needed.`);
      notify.success(FEEDBACK_MESSAGES.otpSent, { source: "auth", id: "change-email:success" });
    } catch (changeEmailError) {
      if (!isMountedRef.current) return;
      setStatus("idle");
      const message = mapAuthErrorForClient(changeEmailError);
      setNotice(message);
      notify.error(message, { source: "auth", id: "change-email:catch" });
    }
  }

  function toggleSignInOtpMode() {
    setSignInOtpMode((current) => !current);
    setSignInOtpSent(false);
    setOtpCode("");
    setError(null);
    setNotice(null);
  }

  async function signInWithGoogle() {
    if (!providers.google || !isMountedRef.current) return;
    setStatus("google");
    setError(null);

    try {
      const supabase = createClient();
      const { error: oauthError } = await raceWithTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: buildOAuthCallbackUrl(nextPath),
            queryParams: {
              prompt: "select_account",
              access_type: "offline"
            },
            skipBrowserRedirect: false
          },
        }),
        undefined,
        "Google sign in"
      );

      if (oauthError) throw oauthError;
    } catch (oauthError) {
      if (!isMountedRef.current) return;
      await recordClientAuthEvent("auth.failed_login", {
        provider: "google",
        error: oauthError instanceof Error ? oauthError.message : "Sign in failed."
      }, auditToken);
      setStatus("idle");
      setError(mapAuthErrorForClient(oauthError));
    }
  }

  const busy = status !== "idle";
  const showBusy = busy;
  const showInlineEmail = providers.email;
  const isSignUp = mode === "signup";

  if (verificationPending) {
    return (
      <div className={styles.authCard} data-testid="login-auth-card">
        <VerificationPendingPanel
          email={pendingEmail}
          busy={busy}
          message={notice}
          otpCode={otpCode}
          changeEmailMode={changeEmailMode}
          newEmail={newEmail}
          onOtpChange={setOtpCode}
          onVerify={verifySignupOtp}
          onResend={resendVerification}
          onStartChangeEmail={startChangeEmail}
          onCancelChangeEmail={cancelChangeEmail}
          onNewEmailChange={setNewEmail}
          onSubmitChangeEmail={submitChangeEmail}
        />
      </div>
    );
  }

  return (
    <div className={styles.authCard} data-testid="login-auth-card">
      {showInlineEmail ? (
        <div className={styles.modeToggle} role="tablist" aria-label="Sign-in options">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            className={isSignUp ? styles.modeTab : `${styles.modeTab} ${styles.modeTabActive}`}
            onClick={() => switchMode("signin")}
            data-testid="auth-mode-signin"
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignUp}
            className={isSignUp ? `${styles.modeTab} ${styles.modeTabActive}` : styles.modeTab}
            onClick={() => switchMode("signup")}
            data-testid="auth-mode-signup"
          >
            Create Account
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={styles.inlineAlert} role="alert">
          {error}
          {redirectTo ? (
            <>
              {" "}
              <a href={redirectTo} className={styles.recoveryLink}>
                Continue
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {notice && !verificationPending ? <p className={styles.verificationNotice} role="status">{notice}</p> : null}

      <div data-testid="login-guest-account">
        {socialEnabled && providers.google ? (
          <section className={styles.methodStack} data-testid="login-social-methods" aria-label="Continue with Google">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={showBusy}
              data-testid="login-google-button"
              className={styles.googleButton}
              aria-busy={status === "google"}
            >
              <GoogleIcon />
              <span>
                {status === "google" ? "Signing in…" : "Continue With Google"}
              </span>
            </button>
          </section>
        ) : null}

        {showInlineEmail && socialEnabled ? (
          <div className={styles.methodDivider} aria-hidden="true">
            <span>or</span>
          </div>
        ) : null}

        {showInlineEmail && isSignUp ? (
          <section className={styles.emailSection} aria-label="Create account">
            <p className={styles.signupStepHint} data-testid="signup-step-indicator">
              Step {signupStep} of 3
              {signupStep === 1 ? " — Your name" : null}
              {signupStep === 2 ? " — Email & phone" : null}
              {signupStep === 3 ? " — Password" : null}
            </p>
            <form
              onSubmit={signupStep < 3 ? advanceSignupStep : submitSignUp}
              className={styles.authForm}
              data-testid="signup-auth-form"
              data-signup-step={signupStep}
            >
              {signupStep === 1 ? (
                <label className={styles.field} htmlFor={fullNameFieldId}>
                  <span className={styles.labelText}>Full name</span>
                  <input
                    id={fullNameFieldId}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    type="text"
                    autoComplete="name"
                    className={styles.authInput}
                    aria-invalid={Boolean(error) || undefined}
                  />
                </label>
              ) : null}

              {signupStep === 2 ? (
                <>
                  <label className={styles.field} htmlFor={emailFieldId}>
                    <span className={styles.labelText}>Email address</span>
                    <input
                      id={emailFieldId}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className={styles.authInput}
                      aria-invalid={Boolean(error) || undefined}
                    />
                  </label>

                  <div className={styles.field}>
                    <span className={styles.labelText}>Phone number</span>
                    <PhoneCountryField
                      id={phoneFieldId}
                      countryCode={phoneCountryCode}
                      national={phoneNational}
                      onCountryChange={setPhoneCountryCode}
                      onNationalChange={setPhoneNational}
                      selectClassName={styles.authInput}
                      inputClassName={styles.authInput}
                    />
                  </div>
                </>
              ) : null}

              {signupStep === 3 ? (
                <>
                  <PasswordField
                    id={passwordFieldId}
                    toggleId={passwordToggleId}
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    showPassword={showPassword}
                    onTogglePassword={() => setShowPassword((current) => !current)}
                    autoComplete="new-password"
                    hasError={Boolean(error)}
                  />
                  <p className={styles.otpHint} data-testid="password-rules-hint">{PASSWORD_RULES_HINT}</p>

                  <PasswordField
                    id={confirmPasswordFieldId}
                    toggleId={confirmPasswordToggleId}
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    showPassword={showConfirmPassword}
                    onTogglePassword={() => setShowConfirmPassword((current) => !current)}
                    autoComplete="new-password"
                    hasError={Boolean(error)}
                  />
                </>
              ) : null}

              <button
                type="submit"
                disabled={showBusy}
                aria-busy={showBusy}
                className={styles.authSubmit}
                data-testid={signupStep === 3 ? "signup-email-submit" : "signup-step-continue"}
              >
                {signupStep < 3
                  ? "Continue"
                  : status === "submitting"
                    ? "Creating account…"
                    : "Create account"}
              </button>

              {signupStep > 1 ? (
                <button
                  type="button"
                  className={styles.modeLink}
                  disabled={showBusy}
                  onClick={() => {
                    setError(null);
                    setSignupStep((current) => (current === 3 ? 2 : 1));
                  }}
                  data-testid="signup-step-back"
                >
                  Back
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {showInlineEmail && !isSignUp ? (
          <section className={styles.emailSection} aria-label="Email sign in" data-testid="auth-signin-otp-mode">
            {signInOtpMode ? (
              signInOtpSent ? (
                <form onSubmit={verifySignInOtp} className={styles.authForm} data-testid="login-otp-form">
                  <p className={styles.verificationCopy}>
                    We emailed an 8-digit code to <strong>{normalizeSignupEmail(email)}</strong>. Enter it to sign in.
                  </p>
                  <OtpInput value={otpCode} onChange={setOtpCode} disabled={showBusy} />
                  <p className={styles.otpHint}>Takes a moment — check inbox and spam if needed.</p>
                  <button
                    type="submit"
                    disabled={showBusy || otpCode.length !== OTP_LENGTH}
                    aria-busy={showBusy}
                    className={styles.authSubmit}
                    data-testid="auth-verify-otp"
                  >
                    {status === "verifying_otp" ? "Signing in…" : "Verify and sign in"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={showBusy}
                    onClick={sendSignInOtp}
                    data-testid="auth-send-otp"
                  >
                    {status === "sending_otp" ? "Sending…" : "Resend code"}
                  </button>
                  <button
                    type="button"
                    className={styles.modeLink}
                    disabled={showBusy}
                    onClick={toggleSignInOtpMode}
                  >
                    Use password instead
                  </button>
                </form>
              ) : (
                <div className={styles.authForm}>
                  <label className={styles.field} htmlFor={emailFieldId}>
                    <span className={styles.labelText}>email address</span>
                    <input
                      id={emailFieldId}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className={styles.authInput}
                      aria-invalid={Boolean(error) || undefined}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={showBusy || !normalizeSignupEmail(email)}
                    aria-busy={status === "sending_otp"}
                    className={styles.authSubmit}
                    onClick={sendSignInOtp}
                    data-testid="auth-send-otp"
                  >
                    {status === "sending_otp" ? "Sending…" : "Send sign-in code"}
                  </button>
                  <button
                    type="button"
                    className={styles.modeLink}
                    disabled={showBusy}
                    onClick={toggleSignInOtpMode}
                  >
                    Use password instead
                  </button>
                </div>
              )
            ) : (
              <form onSubmit={submitSignIn} className={styles.authForm} data-testid="login-auth-form">
                <label className={styles.field} htmlFor={emailFieldId}>
                  <span className={styles.labelText}>email address</span>
                  <input
                    id={emailFieldId}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={styles.authInput}
                    aria-invalid={Boolean(error) || undefined}
                  />
                </label>

                <PasswordField
                  id={passwordFieldId}
                  toggleId={passwordToggleId}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((current) => !current)}
                  autoComplete="current-password"
                  hasError={Boolean(error)}
                />

                <div className={styles.formMeta}>
                  <Link className={styles.recoveryLink} href="/forgot-password">
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={showBusy}
                  aria-busy={showBusy}
                  className={styles.authSubmit}
                  data-testid="login-email-submit"
                >
                  {status === "submitting" ? "Signing in…" : "Log In"}
                </button>

                <button
                  type="button"
                  className={styles.modeLink}
                  disabled={showBusy}
                  onClick={toggleSignInOtpMode}
                >
                  Sign in with email code
                </button>
              </form>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
