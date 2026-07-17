import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`notifications:${userId}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Lightweight mode for order-list highlighting: distinct entity ids with
  // unread notifications (served by the partial unread-entity index).
  const unreadEntities = new URL(request.url).searchParams.get("unread_entities");
  if (unreadEntities === "orders") {
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("entity_id")
      .eq("recipient_id", userId)
      .eq("entity_table", "orders")
      .eq("status", "unread")
      .not("entity_id", "is", null)
      .limit(500);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });
    }

    const entityIds = [...new Set((rows ?? []).map((row) => String(row.entity_id ?? "")).filter(Boolean))];
    return NextResponse.json({ entityIds });
  }

  // Single round trip for the panel: latest notifications + exact unread count.
  const [listResult, countResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,body,status,priority,entity_table,entity_id,created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("status", "unread")
  ]);

  if (listResult.error) {
    return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });
  }

  return NextResponse.json({
    notifications: listResult.data ?? [],
    unreadCount: countResult.count ?? 0
  });
}
