import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  mapSendEmailHookToOutbound,
  parseHookVerificationSecrets,
  renderAuthEmailHtml,
  resolveAuthEmailSubject,
  verifySupabaseSendEmailHook
} from "@/lib/auth/send-email-hook";
import { Webhook } from "standardwebhooks";
import { getConfiguredEmailProviders, sendEmailWithFallback } from "@/services/email/providers";

describe("email provider fallback chain", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envBackup };
    delete process.env.BREVO_SMTP_LOGIN;
    delete process.env.BREVO_SMTP_KEY;
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it("reports configured providers from environment", () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_FROM_EMAIL = "orders@mithron.co";
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAILERSEND_API_KEY = "mlsn.test";

    expect(getConfiguredEmailProviders()).toMatchObject({
      brevo: true,
      resend: true,
      mailersend: true,
      any: true
    });
  });

  it("falls through Brevo to Resend when primary throws", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.BREVO_FROM_EMAIL = "orders@mithron.co";
    process.env.RESEND_API_KEY = "re_test";

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("Brevo API down"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmailWithFallback({
      to: "user@example.com",
      subject: "Test",
      html: "<p>hi</p>"
    });

    expect(result).toEqual({ ok: true, provider: "resend" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.resend.com/emails");
  });

  it("falls through Resend to MailerSend when both Brevo paths are unavailable", async () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAILERSEND_API_KEY = "mlsn.test";

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("Resend rejected sender"))
      .mockResolvedValueOnce({ ok: true, status: 202 });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmailWithFallback({
      to: "user@example.com",
      subject: "Test",
      html: "<p>hi</p>"
    });

    expect(result).toEqual({ ok: true, provider: "mailersend" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.mailersend.com/v1/email");
  });
});

describe("Supabase send-email hook helpers", () => {
  it("parses v1,whsec secrets for verification", () => {
    expect(parseHookVerificationSecrets("v1,whsec_abc123")).toEqual(["whsec_abc123"]);
  });

  it("maps signup action to 8-digit OTP HTML", () => {
    const html = renderAuthEmailHtml({
      emailActionType: "signup",
      token: "12345678",
      tokenHash: "hash-value",
      redirectTo: "/account",
      siteOrigin: "https://final-mithron-deploy.vercel.app"
    });

    expect(html).toContain("12345678");
    expect(html).toContain("8-digit verification code");
    expect(html).toContain("/auth/confirm?token_hash=hash-value&type=signup");
    expect(resolveAuthEmailSubject("signup")).toBe("Your Mithron verification code");
  });

  it("maps hook payload to outbound email that includes the OTP token", () => {
    const outbound = mapSendEmailHookToOutbound({
      user: { email: "guest@example.com" },
      email_data: {
        token: "87654321",
        token_hash: "hash-abc",
        redirect_to: "/account",
        email_action_type: "signup"
      }
    });

    expect(outbound.to).toBe("guest@example.com");
    expect(outbound.subject).toContain("verification");
    expect(outbound.html).toContain("87654321");
    expect(outbound.html).toContain("token_hash=hash-abc");
  });

  it("rejects invalid hook signatures", () => {
    expect(() => verifySupabaseSendEmailHook(
      JSON.stringify({ user: { email: "a@b.com" }, email_data: {} }),
      {
        "webhook-id": "msg_123",
        "webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "webhook-signature": "v1,invalid"
      },
      "v1,whsec_invalidsecretvalue000000000000000000000="
    )).toThrow();
  });

  it("accepts valid hook signatures", () => {
    const secret = "whsec_" + Buffer.from("01234567890123456789012345678901").toString("base64");
    const webhook = new Webhook(secret);
    const payload = {
      user: { email: "user@example.com" },
      email_data: {
        token: "12345678",
        token_hash: "hash-value",
        redirect_to: "/account",
        email_action_type: "signup"
      }
    };
    const body = JSON.stringify(payload);
    const timestamp = new Date();
    const msgId = "msg_test";
    const signature = webhook.sign(msgId, timestamp, body);

    const verified = verifySupabaseSendEmailHook(
      body,
      {
        "webhook-id": msgId,
        "webhook-timestamp": `${Math.floor(timestamp.getTime() / 1000)}`,
        "webhook-signature": signature
      },
      `v1,${secret}`
    );

    expect(verified.user.email).toBe("user@example.com");
    expect(verified.email_data.email_action_type).toBe("signup");
  });
});
