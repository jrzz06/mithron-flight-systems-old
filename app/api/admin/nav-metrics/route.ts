import { NextResponse } from "next/server";
import { getAdminNavMetricsPayload } from "@/services/nav-metrics";
import { requireRouteAccess } from "@/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireRouteAccess("/admin");
  const metrics = await getAdminNavMetricsPayload();
  return NextResponse.json(metrics);
}
