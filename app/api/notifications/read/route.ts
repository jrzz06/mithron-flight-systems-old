import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";

type MarkReadBody = {
  ids?: unknown;
  entity?: { table?: unknown; id?: unknown };
  all?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks the current user's notifications as read via recipient-scoped
 * security definer RPCs (RLS has no user UPDATE policy on notifications).
 * Accepts one of:
 *   { ids: string[] }                      — specific notifications
 *   { entity: { table, id } }              — all unread tied to an entity (e.g. viewing an order)
 *   { all: true }                          — everything unread
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`notifications-read:${userId}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: MarkReadBody;
  try {
    body = (await request.json()) as MarkReadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.all === true) {
    const { data: updated, error } = await supabase.rpc("mark_all_notifications_read");
    if (error) return NextResponse.json({ error: "Failed to mark notifications read." }, { status: 500 });
    return NextResponse.json({ updated: updated ?? 0 });
  }

  const entityTable = typeof body.entity?.table === "string" ? body.entity.table.trim() : "";
  const entityId = typeof body.entity?.id === "string" ? body.entity.id.trim() : "";
  if (entityTable && entityId) {
    const { data: updated, error } = await supabase.rpc("mark_entity_notifications_read", {
      p_entity_table: entityTable,
      p_entity_id: entityId
    });
    if (error) return NextResponse.json({ error: "Failed to mark notifications read." }, { status: 500 });
    return NextResponse.json({ updated: updated ?? 0 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)).slice(0, 100)
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Provide ids, entity, or all." }, { status: 400 });
  }

  const { data: updated, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (error) return NextResponse.json({ error: "Failed to mark notifications read." }, { status: 500 });
  return NextResponse.json({ updated: updated ?? 0 });
}
