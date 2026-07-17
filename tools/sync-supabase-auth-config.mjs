#!/usr/bin/env node
/**
 * Sync hosted Supabase Auth config (SMTP, redirects, OTP length, email templates).
 * Reads secrets from .env.local — never prints passwords.
 *
 * Usage: node tools/sync-supabase-auth-config.mjs [--dry-run]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");

const CANONICAL_PRODUCTION_ORIGIN = "https://final-mithron-deploy.vercel.app";
const BRAND_PRODUCTION_ORIGIN = "https://www.mithron.co";
const DEFAULT_AUTH_REDIRECT_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  CANONICAL_PRODUCTION_ORIGIN,
  BRAND_PRODUCTION_ORIGIN
];

function buildAuthRedirectAllowList(env) {
  const origins = new Set(DEFAULT_AUTH_REDIRECT_ORIGINS);
  const configuredProduction = env.get("MITHRON_PRODUCTION_HOST")?.trim();
  if (configuredProduction) {
    origins.add(configuredProduction.replace(/\/$/, ""));
  }
  const siteUrl = env.get("NEXT_PUBLIC_SITE_URL")?.trim();
  if (siteUrl) {
    origins.add(siteUrl.replace(/\/$/, ""));
  }
  return [...origins].flatMap((origin) => [
    `${origin}/**`,
    `${origin}/auth/callback`,
    `${origin}/auth/confirm`
  ]);
}

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

const envForAllowList = parseEnvFile(resolve(root, ".env.local"));
const ALLOW_LIST = buildAuthRedirectAllowList(envForAllowList).join(",");

const CONFIRMATION_TEMPLATE = `<h2>Confirm your email address</h2>
<p>Enter this 8-digit verification code on the sign-up page:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace;">{{ .Token }}</p>
<p>Or follow the link below to confirm this email address and finish signing up.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email address</a></p>
<p>This code expires in one hour. If you did not create an account, you can ignore this email.</p>`;

const MAGIC_LINK_TEMPLATE = `<h2>Your sign-in code</h2>
<p>Enter this 8-digit code to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace;">{{ .Token }}</p>
<p>Or follow the link below to sign in. This link expires shortly and can only be used once.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>If you did not request this, you can ignore this email.</p>`;

const RECOVERY_TEMPLATE = `<h2>Reset your password</h2>
<p>We received a request to reset your password. Follow the link below to choose a new one.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`;

function requireEnv(env, key) {
  const value = env.get(key)?.trim();
  if (!value) {
    throw new Error(`Missing ${key} in .env.local`);
  }
  return value;
}

function generateHookSecret() {
  return `v1,whsec_${randomBytes(32).toString("base64")}`;
}

function ensureHookSecret(env, envPath) {
  const existing = env.get("AUTH_HOOK_SEND_EMAIL_SECRET")?.trim();
  if (existing) return existing;

  const generated = generateHookSecret();
  const line = `AUTH_HOOK_SEND_EMAIL_SECRET=${generated}`;
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, `${current.trimEnd()}${current.endsWith("\n") || !current ? "" : "\n"}${line}\n`, "utf8");
  console.log("Generated AUTH_HOOK_SEND_EMAIL_SECRET in .env.local — sync this to Vercel before deploying.");
  return generated;
}

function summarize(config) {
  return {
    site_url: config.site_url,
    uri_allow_list: config.uri_allow_list,
    external_google_enabled: config.external_google_enabled,
    external_email_enabled: config.external_email_enabled,
    smtp_host: config.smtp_host,
    smtp_port: config.smtp_port,
    smtp_user: config.smtp_user,
    smtp_admin_email: config.smtp_admin_email,
    smtp_sender_name: config.smtp_sender_name,
    smtp_pass_set: Boolean(config.smtp_pass),
    mailer_otp_length: config.mailer_otp_length,
    mailer_autoconfirm: config.mailer_autoconfirm,
    hook_send_email_enabled: config.hook_send_email_enabled,
    hook_send_email_uri: config.hook_send_email_uri,
    hook_send_email_secrets_set: Boolean(config.hook_send_email_secrets),
    confirmation_has_token: String(config.mailer_templates_confirmation_content ?? "").includes("{{ .Token }}"),
    magic_link_has_token: String(config.mailer_templates_magic_link_content ?? "").includes("{{ .Token }}")
  };
}

async function main() {
  const env = parseEnvFile(resolve(root, ".env.local"));
  const token = requireEnv(env, "SUPABASE_ACCESS_TOKEN");
  const projectRef = requireEnv(env, "SUPABASE_PROJECT_REF");
  const smtpUser = requireEnv(env, "BREVO_SMTP_LOGIN");
  const smtpPass = requireEnv(env, "BREVO_SMTP_KEY");
  const smtpHost = env.get("BREVO_SMTP_HOST")?.trim() || "smtp-relay.brevo.com";
  const smtpPort = env.get("BREVO_SMTP_PORT")?.trim() || "587";
  const smtpAdmin = env.get("BREVO_FROM_EMAIL")?.trim() || "orders@mithron.co";
  const smtpSender = env.get("BREVO_FROM_NAME")?.trim() || "Mithron India Smart Services Pvt Ltd";
  const envPath = resolve(root, ".env.local");
  const hookSecret = ensureHookSecret(env, envPath);
  const hookEnabled = env.get("SUPABASE_SEND_EMAIL_HOOK_ENABLED")?.trim() === "true";

  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const getResponse = await fetch(url, { headers });
  if (!getResponse.ok) {
    throw new Error(`GET auth config failed: ${getResponse.status} ${await getResponse.text()}`);
  }
  const current = await getResponse.json();
  console.log("Current auth config summary:");
  console.log(JSON.stringify(summarize(current), null, 2));

  const patch = {
    site_url: CANONICAL_PRODUCTION_ORIGIN,
    uri_allow_list: ALLOW_LIST,
    mailer_autoconfirm: false,
    mailer_otp_length: 8,
    mailer_otp_exp: 3600,
    rate_limit_email_sent: 60,
    smtp_max_frequency: 10,
    smtp_host: smtpHost,
    smtp_port: String(smtpPort),
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    smtp_admin_email: smtpAdmin,
    smtp_sender_name: smtpSender,
    external_email_enabled: true,
    mailer_templates_confirmation_content: CONFIRMATION_TEMPLATE,
    mailer_templates_magic_link_content: MAGIC_LINK_TEMPLATE,
    mailer_templates_recovery_content: RECOVERY_TEMPLATE,
    mailer_subjects_confirmation: "Your Mithron verification code",
    mailer_subjects_magic_link: "Your Mithron sign-in code",
    mailer_subjects_recovery: "Reset your Mithron password",
    hook_send_email_enabled: hookEnabled,
    hook_send_email_uri: `${CANONICAL_PRODUCTION_ORIGIN}/api/auth/hooks/send-email`,
    hook_send_email_secrets: hookSecret
  };

  if (dryRun) {
    console.log("Dry run — would PATCH:", JSON.stringify({
      ...patch,
      smtp_pass: "<redacted>"
    }, null, 2));
    return;
  }

  const patchResponse = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch)
  });
  if (!patchResponse.ok) {
    throw new Error(`PATCH auth config failed: ${patchResponse.status} ${await patchResponse.text()}`);
  }
  const updated = await patchResponse.json();
  console.log("Updated auth config summary:");
  console.log(JSON.stringify(summarize(updated), null, 2));
  console.log("Supabase auth config sync complete.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
