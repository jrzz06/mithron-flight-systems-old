"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AccountCard, AccountSection } from "@/components/account";
import { Button } from "@/components/ui/button";
import { wrapServerAction } from "@/hooks/use-async-action";
import { sendPasswordResetAction } from "./actions";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";

type SecurityPanelProps = {
  workspaceHref: string | null;
  workspaceLabel: string;
  isStaff: boolean;
  email: string | null;
  mfaRequiredNotice?: string | null;
};

const timedSendPasswordReset = wrapServerAction(sendPasswordResetAction, { label: "Password reset" });

export function SecurityPanel({ workspaceHref, workspaceLabel, isStaff, email, mfaRequiredNotice }: SecurityPanelProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handlePasswordReset() {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const result = await timedSendPasswordReset();
        if (result.ok) {
          setMessage(result.message);
          notify.success(FEEDBACK_MESSAGES.passwordResetSent, { source: "account", id: "password:reset-sent" });
        } else {
          setError(result.message);
          notify.error(result.message, { source: "account", id: "password:reset-error" });
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : "Unable to send password reset email.";
        setError(text);
        notify.error(text, { source: "account", id: "password:reset-error" });
      }
    });
  }

  return (
    <AccountCard>
      <AccountSection
        title="Security"
        description={
          isStaff
            ? `Manage security settings for your ${workspaceLabel.toLowerCase()}.`
            : "Change your password using a secure link sent to your email."
        }
      >
        {mfaRequiredNotice ? (
          <p className="mb-4 text-sm text-[var(--account-ink-muted)]">{mfaRequiredNotice}</p>
        ) : null}
        {!isStaff ? (
          <div className="max-w-xl rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-5">
            <p className="text-sm text-[var(--account-ink-muted)]">Registered email</p>
            <p className="mt-1 font-medium text-[var(--account-ink)]">{email || "No email on file"}</p>
            <Button
              type="button"
              className="mt-4"
              disabled={!email || pending}
              aria-busy={pending}
              onClick={handlePasswordReset}
            >
              {pending ? "Sending..." : "Send password reset email"}
            </Button>
            {message ? <p className="mt-3 text-sm text-[var(--account-accent)]">{message}</p> : null}
            {error ? <p className="mt-3 text-sm text-[var(--account-danger)]">{error}</p> : null}
          </div>
        ) : null}

        {workspaceHref ? (
          <div className="mt-6">
            <Button asChild>
              <Link href={workspaceHref}>Open {workspaceLabel}</Link>
            </Button>
          </div>
        ) : null}
      </AccountSection>
    </AccountCard>
  );
}
