import { NextResponse } from "next/server";
import { assertRolePermission, PermissionDeniedError } from "@/lib/auth/permissions";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { getSupabaseAdminConfig } from "@/lib/env";
import { getCurrentAuthContext } from "@/services/auth";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await getCurrentAuthContext();
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      assertRolePermission(auth.role, "orders.write");
    } catch (error) {
      if (error instanceof ProfileDisabledError || error instanceof PermissionDeniedError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    const { orderId } = await context.params;
    if (!orderId?.trim()) {
      return NextResponse.json({ error: "Order id required." }, { status: 400 });
    }

    const config = getSupabaseAdminConfig(process.env);
    if (!config.configured) {
      return NextResponse.json({ payments: [], retryable: true }, { status: 503 });
    }

    const headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    };

    const paymentsResponse = await fetch(
      `${config.url}/rest/v1/payments?select=provider,provider_payment_id,provider_intent_id,status,verified_at,amount,currency&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=5`,
      { headers, cache: "no-store" }
    );

    const payments = paymentsResponse.ok ? await paymentsResponse.json() : [];

    return NextResponse.json({ payments });
  } catch (error) {
    console.error("[admin/orders/enrichment] failed", error);
    return NextResponse.json({ payments: [], error: "Enrichment unavailable.", retryable: true }, { status: 500 });
  }
}
