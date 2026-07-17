"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { recordClientAuthEvent } from "@/lib/auth/audit-client";
import { createClient } from "@/lib/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import styles from "../auth/auth-page.module.css";

function readRecoveryTokensFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function hasRecoveryHash() {
  return Boolean(readRecoveryTokensFromHash()) || (
    typeof window !== "undefined"
    && new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery"
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const { pending, run, setStatus } = useAsyncAction({ label: "Update password" });
  const [message, setMessage] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const recoveryHash = hasRecoveryHash();

    async function resolveRecoverySession() {
      const recoveryTokens = readRecoveryTokensFromHash();
      if (recoveryTokens) {
        const { error } = await supabase.auth.setSession({
          access_token: recoveryTokens.accessToken,
          refresh_token: recoveryTokens.refreshToken
        });
        if (!active) return;
        if (error) {
          setRecoveryReady(false);
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        setRecoveryReady(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session) {
        setRecoveryReady(true);
        return;
      }
      if (!recoveryHash) {
        setRecoveryReady(false);
      }
    }

    void resolveRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setRecoveryReady(true);
        return;
      }
      if (event === "SIGNED_OUT") {
        setRecoveryReady(false);
      }
    });

    const timeout = recoveryHash
      ? window.setTimeout(() => {
          if (!active) return;
          setRecoveryReady((current) => (current === null ? false : current));
        }, 5000)
      : null;

    return () => {
      active = false;
      subscription.unsubscribe();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recoveryReady) return;
    if (pending) return;

    setMessage(null);

    try {
      const result = await run(async () => {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) {
          await recordClientAuthEvent("auth.password_reset", {
            outcome: "completed",
            provider: "supabase"
          });
          return { ok: true as const };
        }
        await recordClientAuthEvent("auth.password_reset", {
          outcome: "failed_update",
          error: error.message,
          provider: "supabase"
        });
        return { ok: false as const, error: mapAuthErrorForClient(error) };
      });

      if (!result) return;
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      router.replace("/login?next=/account");
      router.refresh();
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    }
  }

  if (recoveryReady === null) {
    return <p className={styles.message}>Checking your reset link…</p>;
  }

  if (!recoveryReady) {
    return (
      <div className={styles.form}>
        <p className={styles.message}>
          This password reset link is invalid or has expired. Request a new link to continue.
        </p>
        <Link href="/forgot-password" className={styles.submit}>
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <input
        aria-label="New password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={8}
        type="password"
        autoComplete="new-password"
        className={styles.input}
        placeholder="New secure password"
      />
      {message ? <p className={styles.message}>{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className={styles.submit}
      >
        {pending ? "Updating password" : "Update password"}
      </button>
    </form>
  );
}
