import { NextResponse } from "next/server";
import { getWarehouseNavMetricsPayload } from "@/services/nav-metrics";
import { requireRouteAccess } from "@/services/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireRouteAccess("/warehouse");
  const metrics = await getWarehouseNavMetricsPayload();
  return NextResponse.json(metrics);
}
