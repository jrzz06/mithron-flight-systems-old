import { NextResponse } from "next/server";
import { getAdminNavMetricsPayload } from "@/services/nav-metrics";
import { requireRouteAccess } from "@/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRouteAccess("/admin");
    const metrics = await getAdminNavMetricsPayload();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[admin/nav-metrics] failed", error);
    return NextResponse.json(
      {
        pendingSupplierApprovals: 0,
        pendingOrdersReview: 0,
        newEnquiries: 0,
        newContactRequests: 0,
        retryable: true
      },
      { status: 503 }
    );
  }
}
