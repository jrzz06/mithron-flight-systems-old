"use server";

import { resolveServerRequestOrigin, buildPasswordResetUrl } from "@/lib/auth/request-origin";
import { createClient } from "@/lib/server";

export async function sendPasswordResetAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.trim() : "";

  if (!email) {
    return { ok: false as const, message: "No email address is associated with this account." };
  }

  const origin = await resolveServerRequestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildPasswordResetUrl(origin)
  });

  if (error) {
    return { ok: false as const, message: error.message || "Could not send password reset email." };
  }

  return { ok: true as const, message: `Password reset email sent to ${email}.` };
}
