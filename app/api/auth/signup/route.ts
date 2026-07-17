import { NextResponse } from "next/server";
import { mapAuthErrorForClient } from "@/lib/auth/client-errors";
import { authEmailDeliveryUnavailableResponse, isAuthEmailDeliveryConfigured } from "@/lib/auth/email-delivery-ready";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import {
  normalizeSignupEmail,
  rejectClientSuppliedRole,
  validateSignupEmail,
  validateSignupFullName,
  validateSignupPassword,
  validateSignupPhone
} from "@/lib/auth/signup-validation";
import { buildAuthConfirmUrl, resolveRequestOrigin } from "@/lib/auth/request-origin";
import { createAuthRouteClient } from "@/lib/server";

type SignupBody = {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  phone?: unknown;
  redirectTo?: unknown;
  inviteToken?: unknown;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`auth-signup:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (!isAuthEmailDeliveryConfigured()) {
    return NextResponse.json(authEmailDeliveryUnavailableResponse(), { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as SignupBody;
  const roleError = rejectClientSuppliedRole(body as Record<string, unknown>);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const emailResult = validateSignupEmail(emailRaw);
  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: 400 });
  }
  const email = normalizeSignupEmail(emailResult.value);

  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : password;
  const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken : null;

  const nameResult = validateSignupFullName(typeof body.fullName === "string" ? body.fullName : "");
  if (!nameResult.ok) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }

  const phoneResult = validateSignupPhone(typeof body.phone === "string" ? body.phone : "");
  if (!phoneResult.ok) {
    return NextResponse.json({ error: phoneResult.error }, { status: 400 });
  }

  const passwordResult = validateSignupPassword(password, confirmPassword);
  if (!passwordResult.ok) {
    return NextResponse.json({ error: passwordResult.error }, { status: 400 });
  }

  const origin = resolveRequestOrigin(request);
  const emailRedirectTo = buildAuthConfirmUrl(origin, "/account");
  const { supabase } = await createAuthRouteClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name: nameResult.value,
        display_name: nameResult.value,
        phone: phoneResult.value,
        ...(inviteToken ? { invite_token: inviteToken } : {})
      }
    }
  });

  if (error) {
    return NextResponse.json(
      { error: mapAuthErrorForClient(error, "Unable to create account. Please check your details and try again.") },
      { status: 400 }
    );
  }

  // Supabase anti-enumeration returns an empty identities array for
  // already-registered emails. Missing/null identities still means a new
  // signup (common when confirmation email has just been queued).
  const identities = data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return NextResponse.json(
      {
        code: "already_registered",
        error: "An account with this email already exists. Log in instead."
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    email
  });
}
