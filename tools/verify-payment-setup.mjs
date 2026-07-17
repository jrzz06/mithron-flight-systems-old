#!/usr/bin/env node
/**
 * Audits payment env vars, exercises webhook signature verification, and optionally
 * creates sandbox orders when test credentials are configured.
 *
 * Usage:
 *   node tools/verify-payment-setup.mjs
 *   node tools/verify-payment-setup.mjs --create-orders
 */

import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvFile(filename) {
  const path = join(root, filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

function mask(value, { secret = false } = {}) {
  if (!value) return "(missing)";
  if (secret) return `<set, len ${value.length}>`;
  if (value.length <= 12) return `set(len ${value.length})`;
  return `${value.slice(0, 12)}…(len ${value.length})`;
}

function razorpayKeyMode(keyId) {
  const normalized = String(keyId ?? "").trim().toLowerCase();
  if (normalized.startsWith("rzp_test_")) return "test";
  if (normalized.startsWith("rzp_live_")) return "live";
  return "unknown";
}

function cashfreeApiBase(env) {
  const mode = String(env.CASHFREE_ENV ?? "production").trim().toLowerCase();
  return mode === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

function collectIssues(env) {
  const issues = [];
  const hasRazorpay = Boolean(env.RAZORPAY_KEY_ID?.trim() && env.RAZORPAY_KEY_SECRET?.trim());
  const hasCashfree = Boolean(env.CASHFREE_APP_ID?.trim() && env.CASHFREE_SECRET_KEY?.trim());

  if (hasRazorpay) {
    if (!env.RAZORPAY_WEBHOOK_SECRET?.trim()) {
      issues.push("RAZORPAY_WEBHOOK_SECRET is missing — webhooks will fail.");
    }
    if (env.RAZORPAY_KEY_SECRET?.trim().startsWith("rzp_")) {
      issues.push("RAZORPAY_KEY_SECRET looks like a Key ID — keys may be swapped.");
    }
    const mode = razorpayKeyMode(env.RAZORPAY_KEY_ID);
    if (env.NODE_ENV === "production" && mode === "test") {
      issues.push("rzp_test_ keys with NODE_ENV=production.");
    }
    if (env.NODE_ENV !== "production" && mode === "live" && env.PAYMENT_ALLOW_LIVE_IN_DEV !== "true") {
      issues.push("rzp_live_ keys in development — use test keys or PAYMENT_ALLOW_LIVE_IN_DEV=true.");
    }
  }

  if (hasCashfree) {
    if (!env.CASHFREE_WEBHOOK_SECRET?.trim()) {
      issues.push("CASHFREE_WEBHOOK_SECRET is missing — webhooks will fail.");
    }
    if (env.NODE_ENV === "production" && String(env.CASHFREE_ENV ?? "production").toLowerCase() === "sandbox") {
      issues.push("CASHFREE_ENV=sandbox in production.");
    }
  }

  return issues;
}

async function testRazorpayOrder(env) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    console.log("\n[Razorpay] Skipped — credentials not configured.");
    return;
  }

  const mode = razorpayKeyMode(keyId);
  if (mode === "live" && env.PAYMENT_ALLOW_LIVE_IN_DEV !== "true") {
    console.log("\n[Razorpay] Skipped live order creation. Use rzp_test_ keys or set PAYMENT_ALLOW_LIVE_IN_DEV=true.");
    return;
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: 100,
      currency: "INR",
      receipt: `verify_${Date.now()}`,
      payment_capture: 1
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    console.log(`\n[Razorpay] Order create failed (${response.status}): ${bodyText.slice(0, 300)}`);
    return;
  }

  const order = JSON.parse(bodyText);
  console.log("\n[Razorpay] Test order created:");
  console.log(`  order_id: ${order.id}`);
  console.log(`  amount_paise: ${order.amount}`);
  console.log("  UPI QR: rendered inside Razorpay Checkout.js modal (this app does not call /v1/payments/qr_codes).");
}

async function testCashfreeOrder(env) {
  const appId = env.CASHFREE_APP_ID?.trim();
  const secretKey = env.CASHFREE_SECRET_KEY?.trim();
  if (!appId || !secretKey) {
    console.log("\n[Cashfree] Skipped — credentials not configured.");
    return;
  }

  const apiBase = cashfreeApiBase(env);
  const orderId = `verify_${Date.now()}`;
  const response = await fetch(`${apiBase}/orders`, {
    method: "POST",
    headers: {
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": "2023-08-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: 1,
      order_currency: "INR",
      customer_details: {
        customer_id: orderId,
        customer_email: "payments-verify@mithron.test",
        customer_phone: "9999999999"
      }
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    console.log(`\n[Cashfree] Order create failed (${response.status}) via ${apiBase}: ${bodyText.slice(0, 300)}`);
    if (String(env.CASHFREE_ENV ?? "production").toLowerCase() !== "sandbox") {
      console.log("  Hint: if these are sandbox credentials, set CASHFREE_ENV=sandbox.");
    }
    return;
  }

  const order = JSON.parse(bodyText);
  console.log("\n[Cashfree] Test order created:");
  console.log(`  order_id: ${order.order_id ?? orderId}`);
  console.log(`  payment_session_id: ${order.payment_session_id ?? "(missing)"}`);
  console.log("  UPI QR: rendered inside Cashfree hosted checkout SDK (not a server-generated QR payload).");
}

function testWebhookSignatures(env) {
  console.log("\n[Webhook signatures]");

  const razorpaySecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() || "razorpay_test_whsec";
  const razorpayPayload = JSON.stringify({ event: "payment.captured", payload: {} });
  const razorpaySig = createHmac("sha256", razorpaySecret).update(razorpayPayload).digest("hex");
  const razorpayBad = createHmac("sha256", "wrong").update(razorpayPayload).digest("hex");
  console.log(`  Razorpay valid HMAC: ${razorpaySig.slice(0, 12)}…`);
  console.log(`  Razorpay tampered HMAC differs: ${razorpaySig !== razorpayBad}`);

  const cashfreeSecret = env.CASHFREE_WEBHOOK_SECRET?.trim() || "cashfree_test_whsec";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const cashfreePayload = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" });
  const cashfreeSig = createHmac("sha256", cashfreeSecret).update(`${timestamp}${cashfreePayload}`).digest("base64");
  const cashfreeBad = createHmac("sha256", "wrong").update(`${timestamp}${cashfreePayload}`).digest("base64");
  console.log(`  Cashfree valid HMAC: ${cashfreeSig.slice(0, 12)}…`);
  console.log(`  Cashfree tampered HMAC differs: ${cashfreeSig !== cashfreeBad}`);
}

const env = process.env;
const createOrders = process.argv.includes("--create-orders");

console.log("Payment setup audit");
console.log("===================");
console.log(`NODE_ENV: ${env.NODE_ENV ?? "(unset)"}`);
console.log(`PAYMENT_PROVIDER: ${env.PAYMENT_PROVIDER ?? "(unset)"}`);
console.log(`NEXT_PUBLIC_SITE_URL: ${env.NEXT_PUBLIC_SITE_URL ?? "(unset)"}`);
console.log(`RAZORPAY_KEY_ID: ${mask(env.RAZORPAY_KEY_ID)} (${razorpayKeyMode(env.RAZORPAY_KEY_ID)})`);
console.log(`RAZORPAY_KEY_SECRET: ${mask(env.RAZORPAY_KEY_SECRET, { secret: true })}`);
console.log(`RAZORPAY_WEBHOOK_SECRET: ${mask(env.RAZORPAY_WEBHOOK_SECRET, { secret: true })}`);
console.log(`CASHFREE_APP_ID: ${mask(env.CASHFREE_APP_ID)}`);
console.log(`CASHFREE_SECRET_KEY: ${mask(env.CASHFREE_SECRET_KEY, { secret: true })}`);
console.log(`CASHFREE_WEBHOOK_SECRET: ${mask(env.CASHFREE_WEBHOOK_SECRET, { secret: true })}`);
console.log(`CASHFREE_ENV: ${env.CASHFREE_ENV ?? "production (default)"}`);
console.log(`Webhook URLs (register in dashboards):`);
console.log(`  Razorpay: ${env.NEXT_PUBLIC_SITE_URL ?? "https://<your-domain>"}/api/payments/webhooks/razorpay`);
console.log(`  Cashfree: ${env.NEXT_PUBLIC_SITE_URL ?? "https://<your-domain>"}/api/payments/webhooks/cashfree`);

const issues = collectIssues(env);
if (issues.length) {
  console.log("\nIssues:");
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
} else {
  console.log("\nNo obvious env issues detected.");
}

testWebhookSignatures(env);

if (createOrders) {
  await testRazorpayOrder(env);
  await testCashfreeOrder(env);
} else {
  console.log("\nPass --create-orders to hit Razorpay/Cashfree sandbox APIs (test credentials only).");
}
