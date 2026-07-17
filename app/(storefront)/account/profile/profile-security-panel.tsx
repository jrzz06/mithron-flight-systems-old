"use client";

import { useState, useTransition } from "react";
import { AccountCard, AccountSection } from "@/components/account";
import { Button } from "@/components/ui/button";
import { sendPasswordResetAction } from "@/app/(storefront)/account/security/actions";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { wrapServerAction } from "@/hooks/use-async-action";

type ProfileSecurityPanelProps = {
  email: string | null;
};

const timedSendPasswordReset = wrapServerAction(sendPasswordResetAction, { label: "Password reset" });

export function ProfileSecurityPanel({ email }: ProfileSecurityPanelProps) {
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
        description="Change your password using a secure link sent to your email."
      >
        <div className="max-w-xl rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-5">
          <p className="text-sm text-[var(--account-ink-muted)]">Registered email</p>
          <p className="mt-1 font-medium text-[var(--account-ink)]">{email || "No email on file"}</p>
          <Button
            type="button"
            className="mt-4"
            disabled={!email || pending}
            onClick={handlePasswordReset}
          >
            {pending ? "Sending..." : "Send password reset email"}
          </Button>
          {message ? <p className="mt-3 text-sm text-[var(--account-accent)]">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-[var(--account-danger)]">{error}</p> : null}
        </div>
      </AccountSection>
    </AccountCard>
  );
}
