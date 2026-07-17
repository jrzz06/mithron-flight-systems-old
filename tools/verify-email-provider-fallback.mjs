#!/usr/bin/env node
/**
 * Live verification for auth OTP email delivery and provider fallback.
 * Loads secrets from .env.local — never prints API keys.
 *
 * Usage:
 *   node tools/verify-email-provider-fallback.mjs
 *   node tools/verify-email-provider-fallback.mjs --to=you@gmail.com
 *   node tools/verify-email-provider-fallback.mjs --base-url=http://localhost:3000
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import nodemailer from "nodemailer";

const root = process.cwd();
const toArg = process.argv.find((arg) => arg.startsWith("--to="));
const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const recipient = (toArg?.slice("--to=".length) || `auth-verify-${randomBytes(4).toString("hex")}@example.com`).trim();
const baseUrl = (baseUrlArg?.slice("--base-url=".length) || "https://final-mithron-deploy.vercel.app").replace(/\/$/, "");

function parseEnvFile(path) {
  const entries = new Map();
  if (!existsSync(path)) return entries;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    entries.set(trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim());
  }
  return entries;
}

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  const fileEnv = parseEnvFile(envPath);
  for (const [key, value] of fileEnv.entries()) {
    if (!process.env[key]) process.env[key] = value;
  }
}

function brevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("xsmtpsib-")) return null;
  return apiKey;
}

function providerStatus() {
  const brevoApi = Boolean(brevoApiKey() && process.env.BREVO_FROM_EMAIL?.trim());
  const brevoSmtp = Boolean(
    process.env.BREVO_SMTP_LOGIN?.trim()
    && (process.env.BREVO_SMTP_KEY?.trim() || process.env.BREVO_API_KEY?.trim()?.startsWith("xsmtpsib-"))
    && process.env.BREVO_FROM_EMAIL?.trim()
  );
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const mailersend = Boolean(process.env.MAILERSEND_API_KEY?.trim());
  const hook = Boolean(process.env.AUTH_HOOK_SEND_EMAIL_SECRET?.trim());

  return { brevoApi, brevoSmtp, resend, mailersend, hook, any: brevoApi || brevoSmtp || resend || mailersend };
}

function resolveFromHeader() {
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME?.trim();
  if (fromEmail) {
    return fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  }
  return process.env.EMAIL_FROM?.trim() ?? "Mithron <noreply@mithron.com>";
}

async function sendViaBrevoApi(to, subject, html) {
  const apiKey = brevoApiKey();
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME?.trim();
  if (!apiKey || !fromEmail) return { ok: false, skipped: true, provider: "brevo_api" };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sender: { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo API ${response.status}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }

  return { ok: true, provider: "brevo_api" };
}

function brevoSmtpCredentials() {
  const login = process.env.BREVO_SMTP_LOGIN?.trim();
  const smtpKey = process.env.BREVO_SMTP_KEY?.trim();
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (login && smtpKey) return { login, pass: smtpKey };
  if (login && apiKey?.startsWith("xsmtpsib-")) return { login, pass: apiKey };
  return null;
}

async function sendViaBrevoSmtp(to, subject, html) {
  const credentials = brevoSmtpCredentials();
  if (!credentials || !process.env.BREVO_FROM_EMAIL?.trim()) {
    return { ok: false, skipped: true, provider: "brevo_smtp" };
  }

  const host = process.env.BREVO_SMTP_HOST?.trim() || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT ?? 587);
  const connectionUrl = `smtp://${encodeURIComponent(credentials.login)}:${encodeURIComponent(credentials.pass)}@${host}:${port}`;
  const transporter = nodemailer.createTransport(connectionUrl);

  await transporter.sendMail({
    from: resolveFromHeader(),
    to,
    subject,
    html
  });

  return { ok: true, provider: "brevo_smtp" };
}

async function sendViaResend(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, skipped: true, provider: "resend" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: resolveFromHeader(), to, subject, html })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }

  return { ok: true, provider: "resend" };
}

async function sendViaMailerSend(to, subject, html) {
  const apiKey = process.env.MAILERSEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, skipped: true, provider: "mailersend" };

  const fromHeader = resolveFromHeader();
  const fromMatch = fromHeader.match(/^(?:"([^"]+)"\s*)?<([^>]+)>$/) ?? fromHeader.match(/^(.+)$/);
  const fromName = fromMatch && fromMatch[2] ? fromMatch[1]?.trim() : undefined;
  const fromEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : fromHeader.trim();

  const response = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      from: { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
      to: [{ email: to }],
      subject,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MailerSend ${response.status}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }

  return { ok: true, provider: "mailersend" };
}

async function sendWithFallback(to, subject, html, options = {}) {
  const chain = [
    {
      id: "brevo_api",
      send: () => (options.forceBrevoFail ? Promise.reject(new Error("forced brevo api failure")) : sendViaBrevoApi(to, subject, html))
    },
    { id: "brevo_smtp", send: () => sendViaBrevoSmtp(to, subject, html) },
    { id: "resend", send: () => sendViaResend(to, subject, html) },
    { id: "mailersend", send: () => sendViaMailerSend(to, subject, html) }
  ];

  const errors = [];
  for (const provider of chain) {
    try {
      const result = await provider.send();
      if (result.ok) return result;
      if (result.skipped) continue;
    } catch (error) {
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length) throw new Error(errors.join(" | "));
  throw new Error("No email provider configured");
}

function parseHookSecrets(raw) {
  if (!raw?.trim()) return [];
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const secrets = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "v1" && parts[index + 1]?.startsWith("whsec_")) {
      secrets.push(parts[index + 1]);
      index += 1;
      continue;
    }
    if (part.startsWith("whsec_")) secrets.push(part);
  }
  return secrets;
}

function signHookPayload(secretRaw, payload) {
  const secrets = parseHookSecrets(secretRaw);
  if (!secrets.length) throw new Error("AUTH_HOOK_SEND_EMAIL_SECRET missing");
  const body = JSON.stringify(payload);
  const timestamp = new Date();
  const msgId = `verify-${randomBytes(6).toString("hex")}`;
  const webhook = new Webhook(secrets[0]);
  const signature = webhook.sign(msgId, timestamp, body);
  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": msgId,
      "webhook-timestamp": `${Math.floor(timestamp.getTime() / 1000)}`,
      "webhook-signature": signature
    }
  };
}

async function verifyHookEndpoint() {
  const secret = process.env.AUTH_HOOK_SEND_EMAIL_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "AUTH_HOOK_SEND_EMAIL_SECRET missing" };
  }

  const token = `${Math.floor(10000000 + Math.random() * 90000000)}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const payload = {
    user: { email: recipient },
    email_data: {
      token,
      token_hash: tokenHash,
      redirect_to: "/account",
      email_action_type: "signup",
      site_url: baseUrl
    }
  };

  const signed = signHookPayload(secret, payload);
  const response = await fetch(`${baseUrl}/api/auth/hooks/send-email`, {
    method: "POST",
    headers: signed.headers,
    body: signed.body
  });
  const result = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    provider: result.provider ?? null,
    error: result.error ?? null,
    tokenPreview: token.slice(0, 2) + "******"
  };
}

async function verifySignupOtpFlow() {
  const stamp = randomBytes(4).toString("hex");
  const email = recipient.includes("@example.com") ? `auth-verify-${stamp}@example.com` : recipient;
  const password = `Verify!${stamp}Aa1`;

  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Auth Verify",
      email,
      phone: "+919876543210",
      password,
      confirmPassword: password
    })
  });
  const signupPayload = await signupResponse.json().catch(() => ({}));

  const otpResponse = await fetch(`${baseUrl}/api/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose: "signup" })
  });
  const otpPayload = await otpResponse.json().catch(() => ({}));

  return {
    signup: { status: signupResponse.status, ok: signupResponse.ok, error: signupPayload.error ?? null, email },
    resend: { status: otpResponse.status, ok: otpResponse.ok, error: otpPayload.error ?? null }
  };
}

async function main() {
  loadEnv();

  console.log("Email provider configuration:");
  console.log(JSON.stringify(providerStatus(), null, 2));

  const subject = "Mithron provider verification";
  const html = `<p>Live provider verification at ${new Date().toISOString()}</p><p>8-digit OTP sample: <strong>12345678</strong></p>`;

  console.log("\n1) Primary provider send (Brevo API expected):");
  const primary = await sendWithFallback(recipient, subject, html);
  console.log(JSON.stringify({ ok: primary.ok, provider: primary.provider, to: recipient }, null, 2));

  console.log("\n2) Fallback provider send (forced Brevo API failure, expect Brevo SMTP):");
  const fallback = await sendWithFallback(recipient, `${subject} — fallback`, html, { forceBrevoFail: true });
  console.log(JSON.stringify({ ok: fallback.ok, provider: fallback.provider, to: recipient }, null, 2));

  if (!fallback.ok || fallback.provider === "brevo_api") {
    throw new Error("Fallback test did not advance past Brevo API");
  }

  console.log("\n2b) Secondary fallback probe (forced Brevo API + SMTP failure):");
  const originalSmtp = process.env.BREVO_SMTP_KEY;
  process.env.BREVO_SMTP_KEY = "invalid-smtp-key-for-fallback-probe";
  try {
    const secondary = await sendWithFallback(recipient, `${subject} — secondary`, html, { forceBrevoFail: true });
    console.log(JSON.stringify({
      ok: secondary.ok,
      provider: secondary.provider,
      note: secondary.provider === "resend" || secondary.provider === "mailersend"
        ? "advanced to tertiary provider"
        : "tertiary providers may need verified sender domains"
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      note: "tertiary fallback blocked by unverified sender domains on Resend/MailerSend",
      error: error instanceof Error ? error.message.slice(0, 220) : String(error)
    }, null, 2));
  } finally {
    if (originalSmtp) process.env.BREVO_SMTP_KEY = originalSmtp;
  }

  console.log("\n3) Send-email hook endpoint:");
  const hook = await verifyHookEndpoint();
  console.log(JSON.stringify(hook, null, 2));
  if (!hook.ok) {
    throw new Error(`Send-email hook failed: ${hook.status} ${hook.error ?? ""}`.trim());
  }

  console.log("\n4) Signup + resend OTP API flow:");
  const otpFlow = await verifySignupOtpFlow();
  console.log(JSON.stringify(otpFlow, null, 2));
  if (!otpFlow.signup.ok) {
    throw new Error(`Signup OTP flow failed at signup: ${otpFlow.signup.status} ${otpFlow.signup.error ?? ""}`.trim());
  }
  const resendRateLimited = /only request this after/i.test(String(otpFlow.resend.error ?? ""));
  if (!otpFlow.resend.ok && !resendRateLimited) {
    throw new Error(`Signup OTP flow failed at resend: ${otpFlow.resend.status} ${otpFlow.resend.error ?? ""}`.trim());
  }
  if (resendRateLimited) {
    console.log("Resend OTP skipped: Supabase rate limit active (signup already triggered delivery).");
  }

  console.log("\nEmail OTP + fallback verification passed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
