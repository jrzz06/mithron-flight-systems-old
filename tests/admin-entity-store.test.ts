import { describe, expect, it } from "vitest";
import {
  applyAdminEntityEvent,
  applyAuthoritativeEntityRows,
  reduceAdminEntityEvent,
  type AdminEntityCollections
} from "@/lib/admin/realtime/admin-entity-store";

describe("admin entity store", () => {
  it("applies INSERT events by prepending new rows", () => {
    const rows = [{ id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }];

    const next = applyAdminEntityEvent(rows, "orders", {
      eventType: "INSERT",
      record: { id: "order-2", status: "pending_payment", updated_at: "2026-07-11T10:01:00.000Z" }
    });

    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe("order-2");
    expect(next[1]?.id).toBe("order-1");
  });

  it("applies UPDATE events by merging into the matching row", () => {
    const rows = [{ id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }];

    const next = applyAdminEntityEvent(rows, "orders", {
      eventType: "UPDATE",
      record: { id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:05:00.000Z" }
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.status).toBe("confirmed");
  });

  it("applies DELETE events by removing the matching row", () => {
    const rows = [
      { id: "order-1", status: "paid" },
      { id: "order-2", status: "confirmed" }
    ];

    const next = applyAdminEntityEvent(rows, "orders", {
      eventType: "DELETE",
      record: null,
      oldRecord: { id: "order-1", status: "paid" }
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("order-2");
  });

  it("ignores stale updated_at values during UPDATE merges", () => {
    const rows = [{ id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:05:00.000Z" }];

    const next = applyAdminEntityEvent(rows, "orders", {
      eventType: "UPDATE",
      record: { id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }
    });

    expect(next).toBe(rows);
    expect(next[0]?.status).toBe("confirmed");
  });

  it("merges duplicate identities instead of creating a second row", () => {
    const rows = [{ id: "order-1", status: "paid", note: "existing", updated_at: "2026-07-11T10:00:00.000Z" }];

    const next = applyAdminEntityEvent(rows, "orders", {
      eventType: "INSERT",
      record: { id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:02:00.000Z" }
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.status).toBe("confirmed");
    expect(next[0]?.note).toBe("existing");
  });

  it("reduceAdminEntityEvent updates collections only when rows change", () => {
    const collections: AdminEntityCollections = {
      orders: [{ id: "order-1", status: "paid", updated_at: "2026-07-11T10:00:00.000Z" }]
    };

    const stale = reduceAdminEntityEvent(collections, "orders", {
      eventType: "UPDATE",
      record: { id: "order-1", status: "confirmed", updated_at: "2026-07-11T09:00:00.000Z" }
    });
    expect(stale).toBe(collections);

    const next = reduceAdminEntityEvent(collections, "orders", {
      eventType: "UPDATE",
      record: { id: "order-1", status: "confirmed", updated_at: "2026-07-11T10:05:00.000Z" }
    });
    expect(next).not.toBe(collections);
    expect(next.orders?.[0]?.status).toBe("confirmed");
  });

  it("applyAuthoritativeEntityRows replaceAll swaps the collection", () => {
    const rows = [
      { id: "order-1", status: "paid" },
      { id: "order-2", status: "confirmed" }
    ];
    const authoritative = [{ id: "order-9", status: "shipped" }];

    const next = applyAuthoritativeEntityRows(rows, "orders", authoritative, { replaceAll: true });

    expect(next).toEqual(authoritative);
    expect(next).not.toContainEqual({ id: "order-1", status: "paid" });
  });

  it("applyAuthoritativeEntityRows matchKey replaces rows with the same key", () => {
    const rows = [
      { id: "item-1", order_id: "order-1", product_slug: "drone-a" },
      { id: "item-2", order_id: "order-1", product_slug: "drone-b" }
    ];
    const authoritative = [{ id: "item-9", order_id: "order-1", product_slug: "drone-a", quantity: 2 }];

    const next = applyAuthoritativeEntityRows(rows, "order_items", authoritative, { matchKey: "product_slug" });

    expect(next).toHaveLength(2);
    expect(next.find((row) => row.product_slug === "drone-a")).toEqual(authoritative[0]);
    expect(next.find((row) => row.product_slug === "drone-b")?.id).toBe("item-2");
  });
});
