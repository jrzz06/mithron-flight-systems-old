"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { completeProfileIdentity } from "@/lib/auth/profile-identity";
import { unwrapAuthNextPath } from "@/lib/auth/redirects";
import { CUSTOMER_AUTH_HOME } from "@/lib/auth/guest-auth";
import { createClient } from "@/lib/server";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";

export type CompleteProfileFormState = {
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

export async function completeProfileFormAction(
  _prevState: CompleteProfileFormState,
  formData: FormData
): Promise<CompleteProfileFormState> {
  const nextPath = unwrapAuthNextPath(
    String(formData.get("next") ?? ""),
    CUSTOMER_AUTH_HOME
  );

  try {
    const userId = await currentUserId();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    await completeProfileIdentity({ userId, fullName, phone });
    revalidatePath("/account");
    revalidatePath("/account/complete-profile");
    revalidatePath("/account/profile");
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges
    };
  }

  redirect(nextPath);
}
