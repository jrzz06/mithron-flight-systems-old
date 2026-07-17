import { NextResponse } from "next/server";
import { assertRolePermission, PermissionDeniedError } from "@/lib/auth/permissions";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCurrentAuthContext } from "@/services/auth";
import { lookupCustomers } from "@/services/customer-provisioning";

export async function GET(request: Request) {
  const context = await getCurrentAuthContext();
  const userId = context.userId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const limiter = await checkDistributedRateLimit(`admin-customer-lookup:${userId}`, 60, 60_000);
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    assertRolePermission(context.role, "orders.write");
  } catch (error) {
    if (error instanceof ProfileDisabledError || error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await lookupCustomers(query, 8);
  return NextResponse.json({ results });
}
