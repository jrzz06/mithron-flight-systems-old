import { NextResponse } from "next/server";
import type { EnterprisePermission } from "@/lib/auth/permissions";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { requirePermission } from "@/services/auth";

export async function guardExportRoute(permission: EnterprisePermission) {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      const message = error.message.toLowerCase();
      const status =
        message.includes("not authenticated") ||
        message.includes("authentication required") ||
        message.includes("anonymous")
          ? 401
          : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
}
