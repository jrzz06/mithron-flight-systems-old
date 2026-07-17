"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AccountField,
  AccountInput
} from "@/components/account";
import { StuckPendingSubmitButton } from "@/components/ui/stuck-pending-submit-button";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import {
  updateProfileFormAction,
  type ProfileFormState
} from "./actions";
import { wrapServerAction } from "@/hooks/use-async-action";

const initialState: ProfileFormState = { ok: false };
const timedUpdateProfile = wrapServerAction(updateProfileFormAction, { label: "Save profile" });

export function ProfileForm({
  email,
  displayName,
  phone
}: {
  email: string;
  displayName: string;
  phone: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(timedUpdateProfile, initialState);

  useEffect(() => {
    if (!state.ok && !state.error) return;
    if (state.ok) {
      notify.success(FEEDBACK_MESSAGES.profileUpdated, { source: "account", id: "profile:updated" });
      router.refresh();
      return;
    }
    notify.error(state.error ?? FEEDBACK_MESSAGES.failedToSaveChanges, {
      source: "account",
      id: "profile:error"
    });
  }, [router, state]);

  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <AccountField label="Email address">
        <AccountInput value={email} readOnly disabled aria-readonly="true" />
      </AccountField>
      <AccountField label="Full name">
        <AccountInput
          name="display_name"
          defaultValue={displayName}
          placeholder="Your name"
          autoComplete="name"
        />
      </AccountField>
      <AccountField label="Phone number">
        <AccountInput
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone}
          placeholder="+91 98765 43210"
          required
        />
      </AccountField>
      {state.error ? (
        <p className="text-sm text-[var(--account-danger)]" role="alert">
          {state.error}
        </p>
      ) : null}
      <div>
        <StuckPendingSubmitButton
          pending={pending}
          guardId="profile-form"
          idleLabel="Save profile"
          pendingLabel="Saving..."
        />
      </div>
    </form>
  );
}
