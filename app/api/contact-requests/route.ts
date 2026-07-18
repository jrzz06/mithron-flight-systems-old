import { NextResponse } from "next/server";
import { parseEnquiryRequestBody } from "@/lib/api/enquiries-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { submitLead } from "@/services/leads";
import { createCustomerCheckoutNotificationRecord } from "@/services/admin-actions";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const body = parseEnquiryRequestBody(rawBody);
    if (!body) {
      return NextResponse.json({ error: "Full name, email, phone, subject, and message are required." }, { status: 400 });
    }
    if (!body.subject && !body.message && !body.email) {
      return NextResponse.json({ ok: true, leadId: null, contactRequestId: null });
    }

    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const limit = await checkDistributedRateLimit(`contact-requests:${rateKey}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    if (!userId) {
      const audit = requireClientAuditToken(request);
      if (!audit.ok) {
        return NextResponse.json({ error: audit.error }, { status: 401 });
      }
    }

    const lead = await submitLead(
      {
        customerUserId: userId,
        email: body.email,
        phone: body.phone,
        name: body.fullName,
        message: [body.subject, body.message].filter(Boolean).join("\n\n"),
        source: "contact_form",
        payload: {
          company: body.company ?? null,
          region: body.region ?? null,
          subject: body.subject
        }
      },
      null
    );

    if (userId) {
      try {
        await createCustomerCheckoutNotificationRecord({
          recipient_id: userId,
          channel: "customer",
          title: "Consultation request received",
          body: `We received your request: ${body.subject}`,
          status: "unread",
          entity_table: "leads",
          entity_id: String(lead.id ?? ""),
          metadata: { recipient_email: body.email }
        });
      } catch {
        // Notification failures should not block contact submissions.
      }
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id ?? null,
      contactRequestId: lead.id ?? null
    });
  } catch (error) {
    console.error("[contact-requests] failed", error);
    const message = error instanceof Error ? error.message : "Could not send contact request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
