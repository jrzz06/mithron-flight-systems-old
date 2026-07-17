"use client";

import { FormEvent, useState } from "react";
import { recordClientAuthEvent } from "@/lib/auth/audit-client";
import { resolveClientAuthOrigin } from "@/lib/site-url";
import { useAsyncAction } from "@/hooks/use-async-action";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import styles from "../auth/auth-page.module.css";

type ForgotPasswordFormProps = {
  auditToken?: string | null;
};

export function ForgotPasswordForm({ auditToken }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const { status, pending, run, setStatus } = useAsyncAction({ label: "Password reset request" });
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || status === "success") return;

    setMessage(null);

    try {
      const result = await run(async () => {
        const response = await fetchWithTimeout("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            redirectTo: `${resolveClientAuthOrigin()}/reset-password`
          })
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          await recordClientAuthEvent("auth.password_reset", {
            email,
            outcome: "failed",
            error: data.error ?? "Request failed",
            provider: "supabase"
          }, auditToken);
          return { ok: false as const, error: data.error ?? "Something went wrong. Please try again." };
        }
        await recordClientAuthEvent("auth.password_reset", {
          email,
          outcome: "requested",
          provider: "supabase"
        }, auditToken);
        return { ok: true as const };
      });

      if (!result) return;
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setMessage("Password reset instructions have been sent if the account exists.");
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <input
        aria-label="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        autoComplete="email"
        className={styles.input}
        placeholder="name@company.com"
      />
      {message ? <p className={styles.message}>{message}</p> : null}
      <button
        type="submit"
        disabled={pending || status === "success"}
        className={styles.submit}
      >
        {pending ? "Sending reset" : "Send reset link"}
      </button>
    </form>
  );
}
