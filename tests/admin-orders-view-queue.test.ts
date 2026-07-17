import { describe, expect, it } from "vitest";
import {
  orderMatchesViewQueue,
  resolveOrdersViewQueue,
  viewQueueTabKey
} from "@/components/admin/orders/order-view-helpers";

describe("admin orders view queue", () => {
  it("defaults unknown queues to all", () => {
    expect(resolveOrdersViewQueue("")).toBe("all");
    expect(resolveOrdersViewQueue("not-a-real-queue")).toBe("all");
  });

  it("keeps legacy aliases and queue keys resolvable", () => {
    expect(resolveOrdersViewQueue("review")).toBe("pending_verification");
    expect(resolveOrdersViewQueue("confirmed")).toBe("verified");
    expect(resolveOrdersViewQueue("fulfillment")).toBe("warehouse");
    expect(resolveOrdersViewQueue("archived")).toBe("all");
    expect(resolveOrdersViewQueue("trash")).toBe("all");
    expect(resolveOrdersViewQueue("later")).toBe("all");
    expect(resolveOrdersViewQueue("processing")).toBe("processing");
  });

  it("maps legacy queues onto primary tab highlights", () => {
    expect(viewQueueTabKey("pending_verification")).toBe("pending");
    expect(viewQueueTabKey("review")).toBe("pending");
    expect(viewQueueTabKey("active")).toBe("processing");
    expect(viewQueueTabKey("verified")).toBe("processing");
    expect(viewQueueTabKey("warehouse")).toBe("processing");
    expect(viewQueueTabKey("archived")).toBe("all");
    expect(viewQueueTabKey("trash")).toBe("all");
    expect(viewQueueTabKey("later")).toBe("all");
    expect(viewQueueTabKey("all")).toBe("all");
  });

  it("keeps Pending and Processing non-overlapping", () => {
    const pending = { status: "paid", payment_status: "succeeded" };
    const verified = { status: "confirmed", payment_status: "succeeded", fulfillment_status: "pending" };
    const warehouse = { status: "assigned", payment_status: "succeeded", fulfillment_status: "processing" };

    expect(orderMatchesViewQueue(pending, "pending")).toBe(true);
    expect(orderMatchesViewQueue(pending, "processing")).toBe(false);

    expect(orderMatchesViewQueue(verified, "pending")).toBe(false);
    expect(orderMatchesViewQueue(verified, "processing")).toBe(true);

    expect(orderMatchesViewQueue(warehouse, "pending")).toBe(false);
    expect(orderMatchesViewQueue(warehouse, "processing")).toBe(true);
  });

  it("no longer exposes archived or trash as a dedicated view queue", () => {
    const archived = { status: "delivered", archived_at: "2026-07-01T00:00:00.000Z" };
    const trash = { status: "cancelled", deleted_at: "2026-07-01T00:00:00.000Z" };
    const active = { status: "confirmed", payment_status: "succeeded" };

    expect(resolveOrdersViewQueue("later")).toBe("all");
    expect(orderMatchesViewQueue(archived, "all")).toBe(true);
    expect(orderMatchesViewQueue(trash, "all")).toBe(true);
    expect(orderMatchesViewQueue(active, "cancelled")).toBe(false);
  });
});
