import { createNotificationRecord } from "@/services/admin-actions";

export type UserNotificationChannel = "admin" | "warehouse" | "supplier" | "customer" | "operations";

export type InsertUserNotificationInput = {
  recipientId: string;
  channel: UserNotificationChannel;
  title: string;
  body: string;
  entityTable: string;
  entityId: string;
  actorId: string;
  priority?: "low" | "normal" | "high" | "critical";
  payload?: Record<string, unknown>;
  dedupeKey?: string;
};

/**
 * Inserts a directed notification for a single recipient so their panel's
 * realtime `notifications` subscription can refresh immediately.
 * Failures are logged and swallowed so governance mutations are never blocked.
 */
export async function insertUserNotification(input: InsertUserNotificationInput): Promise<void> {
  try {
    await createNotificationRecord(
      {
        recipient_id: input.recipientId,
        channel: input.channel,
        title: input.title,
        body: input.body,
        status: "unread",
        priority: input.priority ?? "normal",
        entity_table: input.entityTable,
        entity_id: input.entityId,
        payload: input.payload ?? {},
        ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {})
      },
      input.actorId
    );
  } catch (error) {
    console.warn(
      `[mithron-notifications] Failed to notify ${input.recipientId} (${input.title}).`,
      error
    );
  }
}

export function notificationChannelForRole(role: string | null | undefined): UserNotificationChannel {
  switch (role) {
    case "warehouse":
      return "warehouse";
    case "supplier":
      return "supplier";
    case "admin":
      return "admin";
    case "operations":
      return "operations";
    default:
      return "customer";
  }
}
