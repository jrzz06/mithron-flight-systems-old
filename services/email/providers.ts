import nodemailer from "nodemailer";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export type EmailProviderId = "brevo_api" | "brevo_smtp" | "resend" | "mailersend";

export type EmailSendResult = {
  ok: boolean;
  skipped?: boolean;
  provider?: EmailProviderId;
};

function brevoFromParts() {
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME?.trim();
  if (!fromEmail) return null;
  return { email: fromEmail, name: fromName ?? undefined };
}

function resolveFromHeader() {
  const brevo = brevoFromParts();
  if (brevo) {
    return brevo.name ? `"${brevo.name}" <${brevo.email}>` : brevo.email;
  }
  return process.env.EMAIL_FROM?.trim() ?? "Mithron <noreply@mithron.com>";
}

function brevoSmtpCredentials() {
  const login = process.env.BREVO_SMTP_LOGIN?.trim();
  const smtpKey = process.env.BREVO_SMTP_KEY?.trim();
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (login && smtpKey) {
    return { login, pass: smtpKey };
  }

  if (login && apiKey?.startsWith("xsmtpsib-")) {
    return { login, pass: apiKey };
  }

  return null;
}

function brevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("xsmtpsib-")) return null;
  return apiKey;
}

export function getConfiguredEmailProviders(env: Record<string, string | undefined> = process.env) {
  const hasBrevoApi = Boolean(brevoApiKeyFromEnv(env) && env.BREVO_FROM_EMAIL?.trim());
  const hasBrevoSmtp = Boolean(brevoSmtpCredentialsFromEnv(env) && env.BREVO_FROM_EMAIL?.trim());
  const hasResend = Boolean(env.RESEND_API_KEY?.trim());
  const hasMailerSend = Boolean(env.MAILERSEND_API_KEY?.trim());
  const hasHook = Boolean(env.AUTH_HOOK_SEND_EMAIL_SECRET?.trim());

  return {
    brevo: hasBrevoApi || hasBrevoSmtp,
    brevoApi: hasBrevoApi,
    brevoSmtp: hasBrevoSmtp,
    resend: hasResend,
    mailersend: hasMailerSend,
    hook: hasHook,
    any: hasBrevoApi || hasBrevoSmtp || hasResend || hasMailerSend
  };
}

function brevoApiKeyFromEnv(env: Record<string, string | undefined>) {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("xsmtpsib-")) return null;
  return apiKey;
}

function brevoSmtpCredentialsFromEnv(env: Record<string, string | undefined>) {
  const login = env.BREVO_SMTP_LOGIN?.trim();
  const smtpKey = env.BREVO_SMTP_KEY?.trim();
  const apiKey = env.BREVO_API_KEY?.trim();

  if (login && smtpKey) {
    return { login, pass: smtpKey };
  }

  if (login && apiKey?.startsWith("xsmtpsib-")) {
    return { login, pass: apiKey };
  }

  return null;
}

async function sendViaBrevoApi(payload: EmailPayload): Promise<EmailSendResult | null> {
  const apiKey = brevoApiKey();
  if (!apiKey) return null;

  const from = brevoFromParts();
  if (!from) {
    console.warn("[email] Brevo API key is set but BREVO_FROM_EMAIL is missing; skipping Brevo API send.");
    return { ok: false, skipped: true };
  }

  const response = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sender: {
        email: from.email,
        ...(from.name ? { name: from.name } : {})
      },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to send email via Brevo API: ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  return { ok: true, provider: "brevo_api" };
}

async function sendViaBrevoSmtp(payload: EmailPayload): Promise<EmailSendResult | null> {
  const credentials = brevoSmtpCredentials();
  if (!credentials) return null;

  const from = resolveFromHeader();
  if (!process.env.BREVO_FROM_EMAIL?.trim()) {
    console.warn("[email] Brevo SMTP credentials are set but BREVO_FROM_EMAIL is missing; skipping Brevo SMTP send.");
    return { ok: false, skipped: true };
  }

  const host = process.env.BREVO_SMTP_HOST?.trim() || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: credentials.login, pass: credentials.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000
  });

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html
  });

  return { ok: true, provider: "brevo_smtp" };
}

async function sendViaResend(payload: EmailPayload): Promise<EmailSendResult | null> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  const from = resolveFromHeader();

  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to send email via Resend: ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  return { ok: true, provider: "resend" };
}

async function sendViaMailerSend(payload: EmailPayload): Promise<EmailSendResult | null> {
  const apiKey = process.env.MAILERSEND_API_KEY?.trim();
  if (!apiKey) return null;

  const fromHeader = resolveFromHeader();
  const fromMatch = fromHeader.match(/^(?:"([^"]+)"\s*)?<([^>]+)>$/) ?? fromHeader.match(/^(.+)$/);
  const fromName = fromMatch && fromMatch[2] ? fromMatch[1]?.trim() : undefined;
  const fromEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : fromHeader.trim();

  const response = await fetchWithTimeout("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      from: {
        email: fromEmail,
        ...(fromName ? { name: fromName } : {})
      },
      to: [{ email: payload.to }],
      subject: payload.subject,
      html: payload.html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to send email via MailerSend: ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  return { ok: true, provider: "mailersend" };
}

const providerChain: Array<{
  id: EmailProviderId;
  send: (payload: EmailPayload) => Promise<EmailSendResult | null>;
}> = [
  { id: "brevo_api", send: sendViaBrevoApi },
  { id: "brevo_smtp", send: sendViaBrevoSmtp },
  { id: "resend", send: sendViaResend },
  { id: "mailersend", send: sendViaMailerSend }
];

export async function sendEmailWithFallback(payload: EmailPayload): Promise<EmailSendResult> {
  const errors: string[] = [];

  for (const provider of providerChain) {
    let result: EmailSendResult | null;
    try {
      result = await provider.send(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[email] ${provider.id} failed; trying next provider.`, message);
      errors.push(`${provider.id}: ${message}`);
      continue;
    }

    if (!result) continue;
    if (result.ok) {
      if (provider.id !== "brevo_api" && provider.id !== "brevo_smtp") {
        console.info(`[email] Delivered via fallback provider: ${provider.id}`);
      }
      return result;
    }
    if (result.skipped) continue;
  }

  if (errors.length) {
    throw new Error(`All email providers failed: ${errors.join(" | ")}`);
  }

  console.warn("[email] No email provider configured; skipping outbound email.", payload.subject);
  return { ok: false, skipped: true };
}
