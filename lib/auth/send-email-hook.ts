import { Webhook } from "standardwebhooks";
import { getSiteOrigin } from "@/lib/site-url";

export type SupabaseSendEmailAction =
  | "signup"
  | "invite"
  | "magiclink"
  | "email"
  | "recovery"
  | "email_change"
  | "reauthentication"
  | string;

export type SupabaseSendEmailHookPayload = {
  user: {
    email?: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to?: string;
    email_action_type: SupabaseSendEmailAction;
    site_url?: string;
  };
};

function normalizeHookSecret(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("v1,")) {
    return trimmed.slice(3).trim();
  }
  return trimmed.startsWith("whsec_") ? trimmed : `whsec_${trimmed}`;
}

export function parseHookVerificationSecrets(raw: string | undefined) {
  if (!raw?.trim()) return [];

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const secrets: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "v1" && parts[index + 1]?.startsWith("whsec_")) {
      secrets.push(parts[index + 1]);
      index += 1;
      continue;
    }
    if (part.startsWith("whsec_")) {
      secrets.push(part);
      continue;
    }
    if (part.startsWith("v1,whsec_")) {
      secrets.push(normalizeHookSecret(part));
    }
  }

  return secrets;
}

export function verifySupabaseSendEmailHook(
  body: string,
  headers: Record<string, string | undefined>,
  secretRaw: string | undefined
): SupabaseSendEmailHookPayload {
  const secrets = parseHookVerificationSecrets(secretRaw);
  if (!secrets.length) {
    throw new Error("AUTH_HOOK_SEND_EMAIL_SECRET is not configured.");
  }

  const webhookId = headers["webhook-id"]?.trim();
  const webhookTimestamp = headers["webhook-timestamp"]?.trim();
  const webhookSignature = headers["webhook-signature"]?.trim();
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error("Missing send-email hook verification headers.");
  }

  const verificationHeaders = {
    "webhook-id": webhookId,
    "webhook-timestamp": webhookTimestamp,
    "webhook-signature": webhookSignature
  };

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      const webhook = new Webhook(secret);
      return webhook.verify(body, verificationHeaders) as SupabaseSendEmailHookPayload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Invalid send-email hook signature.");
}

export function buildAuthConfirmUrl(input: {
  tokenHash: string;
  emailActionType: SupabaseSendEmailAction;
  redirectTo?: string;
  siteOrigin?: string;
}) {
  const origin = input.siteOrigin ?? getSiteOrigin();
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", input.tokenHash);
  url.searchParams.set("type", input.emailActionType);
  if (input.redirectTo?.trim()) {
    url.searchParams.set("next", input.redirectTo.trim());
  }
  return url.toString();
}

function confirmationTemplate(token: string, confirmUrl: string) {
  return `<h2>Confirm your email address</h2>
<p>Enter this 8-digit verification code on the sign-up page:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace;">${token}</p>
<p>Or follow the link below to confirm this email address and finish signing up.</p>
<p><a href="${confirmUrl}">Confirm email address</a></p>
<p>This code expires in one hour. If you did not create an account, you can ignore this email.</p>`;
}

function signInOtpTemplate(token: string, confirmUrl: string) {
  return `<h2>Your sign-in code</h2>
<p>Enter this 8-digit code to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace;">${token}</p>
<p>Or follow the link below to sign in. This link expires shortly and can only be used once.</p>
<p><a href="${confirmUrl}">Sign in</a></p>
<p>If you did not request this, you can ignore this email.</p>`;
}

function recoveryTemplate(confirmUrl: string) {
  return `<h2>Reset your password</h2>
<p>We received a request to reset your password. Follow the link below to choose a new one.</p>
<p><a href="${confirmUrl}">Reset password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`;
}

export function resolveAuthEmailSubject(action: SupabaseSendEmailAction) {
  switch (action) {
    case "signup":
    case "invite":
    case "email_change":
      return "Your Mithron verification code";
    case "magiclink":
    case "email":
      return "Your Mithron sign-in code";
    case "recovery":
      return "Reset your Mithron password";
    default:
      return "Your Mithron verification code";
  }
}

export function renderAuthEmailHtml(input: {
  emailActionType: SupabaseSendEmailAction;
  token: string;
  tokenHash: string;
  redirectTo?: string;
  siteOrigin?: string;
}) {
  const confirmUrl = buildAuthConfirmUrl({
    tokenHash: input.tokenHash,
    emailActionType: input.emailActionType,
    redirectTo: input.redirectTo,
    siteOrigin: input.siteOrigin
  });

  switch (input.emailActionType) {
    case "recovery":
      return recoveryTemplate(confirmUrl);
    case "magiclink":
    case "email":
      return signInOtpTemplate(input.token, confirmUrl);
    case "signup":
    case "invite":
    case "email_change":
    default:
      return confirmationTemplate(input.token, confirmUrl);
  }
}

export function mapSendEmailHookToOutbound(input: SupabaseSendEmailHookPayload) {
  const recipient = input.user.email?.trim();
  if (!recipient) {
    throw new Error("Send-email hook payload is missing user.email.");
  }

  const { token, token_hash: tokenHash, redirect_to: redirectTo, email_action_type: emailActionType } = input.email_data;
  if (!token || !tokenHash || !emailActionType) {
    throw new Error("Send-email hook payload is missing required email_data fields.");
  }

  return {
    to: recipient,
    subject: resolveAuthEmailSubject(emailActionType),
    html: renderAuthEmailHtml({
      emailActionType,
      token,
      tokenHash,
      redirectTo
    })
  };
}
