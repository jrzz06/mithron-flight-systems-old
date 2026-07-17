"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/server";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { validateSignupFullName, validateSignupPhone } from "@/lib/auth/signup-validation";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { upsertProfileRecord } from "@/services/admin-actions";

export type ProfileFormState = {
  ok: boolean;
  error?: string;
};

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) throw new Error(FEEDBACK_MESSAGES.loginRequired);
  return userId;
}

function selfProfileGuard(expectedUserId: string) {
  return {
    guard: async () => {
      const userId = await currentUserId();
      if (userId !== expectedUserId) {
        throw new PermissionDeniedError("You can only update your own profile.");
      }
    }
  };
}

export async function updateProfileFormAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  try {
    const userId = await currentUserId();
    const displayName = String(formData.get("display_name") ?? "").trim();
    const phoneRaw = String(formData.get("phone") ?? "").trim();

    const nameResult = validateSignupFullName(displayName);
    if (!nameResult.ok) {
      return { ok: false, error: nameResult.error };
    }

    const phoneResult = validateSignupPhone(phoneRaw);
    if (!phoneResult.ok) {
      return { ok: false, error: phoneResult.error };
    }

    await upsertProfileRecord(
      {
        id: userId,
        display_name: nameResult.value,
        full_name: nameResult.value,
        phone: phoneResult.value,
        updated_at: new Date().toISOString()
      },
      userId,
      process.env,
      selfProfileGuard(userId)
    );
    revalidatePath("/account/profile");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges
    };
  }
}
