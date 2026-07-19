import { NextResponse } from "next/server";
import { getSupplierNavMetricsPayload } from "@/services/nav-metrics";
import { requireRouteAccess } from "@/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireRouteAccess("/supplier");
    if (!context.userId) {
      return NextResponse.json({ pendingReview: 0, needsAction: 0, inventoryAlerts: 0 });
    }

    const metrics = await getSupplierNavMetricsPayload(context.userId);
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[supplier/nav-metrics] failed", error);
    return NextResponse.json(
      { pendingReview: 0, needsAction: 0, inventoryAlerts: 0, retryable: true },
      { status: 503 }
    );
  }
}
