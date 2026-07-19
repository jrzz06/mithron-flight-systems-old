import { NextResponse } from "next/server";
import { getWarehouseNavMetricsPayload } from "@/services/nav-metrics";
import { requireRouteAccess } from "@/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRouteAccess("/warehouse");
    const metrics = await getWarehouseNavMetricsPayload();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[warehouse/nav-metrics] failed", error);
    return NextResponse.json({ fulfillmentPending: 0, retryable: true }, { status: 503 });
  }
}
