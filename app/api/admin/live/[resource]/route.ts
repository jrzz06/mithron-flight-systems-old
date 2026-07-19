import { NextResponse } from "next/server";
import { requireRouteAccess } from "@/services/auth";
import { isAdminLiveResourceId } from "@/lib/admin/realtime/admin-resource-registry";
import { loadAdminLiveResource } from "@/lib/admin/realtime/load-admin-live-resource";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ resource: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  await requireRouteAccess("/admin");
  const { resource } = await context.params;
  if (!isAdminLiveResourceId(resource)) {
    return NextResponse.json({ error: "Unknown admin live resource." }, { status: 404 });
  }

  try {
    const payload = await loadAdminLiveResource(resource);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("[admin-live] Failed to load resource.", error);
    return NextResponse.json({ error: "Unable to load admin live resource." }, { status: 500 });
  }
}
