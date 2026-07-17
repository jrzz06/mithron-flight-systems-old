import { describe, expect, it, vi } from "vitest";
import { runOrderFormActionWithConflictRetry } from "@/lib/admin/order-action-client";
import {
  applyAuthoritativeOrderRow,
  isIncomingOrderNewer,
  mergeOrderItemsFromRealtimeEvent,
  mergeOrderRecord,
  mergeOrdersFromRealtimeEvent
} from "@/lib/admin/orders-live-merge";
import { cloneFormDataWithExpectedUpdatedAt, isAdminOrderActionConflict } from "@/lib/admin/order-action-result";

describe("admin orders live merge", () => {
  it("merges a newer realtime update into the matching order", () => {
    const orders = [
      { id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" },
      { id: "order-2", status: "confirmed", updated_at: "2026-07-11T10:00:00.000Z" }
    ];

    const next = mergeOrdersFromRealtimeEvent(
      orders,
      { id: "order-1", status: "admin_review", updated_at: "2026-07-11T10:05:00.000Z" },
      "UPDATE"
    );

    expect(next[0]?.status).toBe("admin_review");
    expect(next[1]?.status).toBe("confirmed");
  });

  it("ignores stale realtime updates", () => {
    const orders = [{ id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:05:00.000Z" }];

    const next = mergeOrdersFromRealtimeEvent(
      orders,
      { id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" },
      "UPDATE"
    );

    expect(next).toBe(orders);
    expect(next[0]?.status).toBe("confirmed");
  });

  it("inserts new orders from realtime INSERT events", () => {
    const orders = [{ id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }];

    const next = mergeOrdersFromRealtimeEvent(
      orders,
      { id: "order-2", status: "pending_payment", updated_at: "2026-07-11T10:01:00.000Z" },
      "INSERT"
    );

    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe("order-2");
  });

  it("replaces optimistic order items when the authoritative INSERT arrives", () => {
    const items = [
      {
        id: "optimistic-1",
        order_id: "order-1",
        product_slug: "drone",
        quantity: 1,
        _optimistic: true
      }
    ];

    const next = mergeOrderItemsFromRealtimeEvent(
      items,
      {
        id: "item-real",
        order_id: "order-1",
        product_slug: "drone",
        quantity: 1,
        updated_at: "2026-07-11T10:01:00.000Z"
      },
      "INSERT"
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("item-real");
    expect(next[0]?._optimistic).toBeUndefined();
  });

  it("compares updated_at timestamps for merge decisions", () => {
    expect(isIncomingOrderNewer("2026-07-11T10:05:00.000Z", "2026-07-11T10:00:00.000Z")).toBe(true);
    expect(isIncomingOrderNewer("2026-07-11T10:00:00.000Z", "2026-07-11T10:05:00.000Z")).toBe(false);
  });

  it("applies authoritative conflict rows from the server", () => {
    const orders = [{ id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }];
    const next = applyAuthoritativeOrderRow(orders, {
      id: "order-1",
      status: "admin_review",
      updated_at: "2026-07-11T10:06:00.000Z"
    });

    expect(next[0]?.status).toBe("admin_review");
    expect(next[0]?.updated_at).toBe("2026-07-11T10:06:00.000Z");
  });

  it("keeps existing order when mergeOrderRecord receives stale data", () => {
    const existing = { id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:05:00.000Z" };
    const merged = mergeOrderRecord(existing, { status: "paid", updated_at: "2026-07-11T10:00:00.000Z" });
    expect(merged).toBe(existing);
  });
});

describe("admin order conflict retry", () => {
  it("rebuilds form data with a fresh expected_updated_at", () => {
    const formData = new FormData();
    formData.set("order_id", "order-1");
    formData.set("expected_updated_at", "2026-07-11T10:00:00.000Z");
    formData.set("queue", "active");

    const next = cloneFormDataWithExpectedUpdatedAt(formData, "2026-07-11T10:05:00.000Z");
    expect(next.get("expected_updated_at")).toBe("2026-07-11T10:05:00.000Z");
    expect(next.get("order_id")).toBe("order-1");
    expect(next.get("queue")).toBe("active");
  });

  it("retries once after patching the live order row", async () => {
    const patchOrder = vi.fn();
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "conflict",
        message: "Concurrent order update detected.",
        currentRow: { id: "order-1", updated_at: "2026-07-11T10:05:00.000Z", status: "admin_review" }
      })
      .mockResolvedValueOnce({ ok: true });

    const formData = new FormData();
    formData.set("order_id", "order-1");
    formData.set("expected_updated_at", "2026-07-11T10:00:00.000Z");

    const outcome = await runOrderFormActionWithConflictRetry(action, formData, {
      orderId: "order-1",
      patchOrder
    });

    expect(outcome.kind).toBe("success");
    expect(action).toHaveBeenCalledTimes(2);
    expect(patchOrder).toHaveBeenCalledWith("order-1", {
      id: "order-1",
      updated_at: "2026-07-11T10:05:00.000Z",
      status: "admin_review"
    });
    expect(action.mock.calls[1]?.[0]?.get("expected_updated_at")).toBe("2026-07-11T10:05:00.000Z");
  });

  it("returns failed when the retry still conflicts", async () => {
    const conflict = {
      ok: false as const,
      code: "conflict" as const,
      message: "Concurrent order update detected.",
      currentRow: { id: "order-1", updated_at: "2026-07-11T10:06:00.000Z" }
    };
    const action = vi.fn().mockResolvedValue(conflict);

    const formData = new FormData();
    formData.set("order_id", "order-1");
    formData.set("expected_updated_at", "2026-07-11T10:00:00.000Z");

    const outcome = await runOrderFormActionWithConflictRetry(action, formData, {
      orderId: "order-1",
      patchOrder: vi.fn()
    });

    expect(outcome.kind).toBe("failed");
    expect(action).toHaveBeenCalledTimes(2);
    expect(isAdminOrderActionConflict(conflict)).toBe(true);
  });
});
