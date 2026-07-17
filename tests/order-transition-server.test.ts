import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serverExpectedUpdatedAt } from "@/lib/admin/order-transition-server";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("order transition server CAS", () => {
  it("uses server updated_at for CAS and ignores client stamps in workflow source", () => {
    const workflow = source("services/order-workflow.ts");
    const server = source("lib/admin/order-transition-server.ts");

    expect(server).toContain("serverExpectedUpdatedAt(order)");
    expect(server).toContain("transitionOrderWithServerCasRetry");
    expect(server).toContain("for (let attempt = 0; attempt < 2; attempt += 1)");
    expect(workflow).toContain("transitionOrderWithServerCasRetry");
    expect(workflow).not.toContain("input.expectedUpdatedAt ??");
    expect(workflow).not.toContain("transitionOrderWithTimelineViaRpc");
  });

  it("reads expected updated_at only from the server row", () => {
    expect(serverExpectedUpdatedAt({ updated_at: "2026-07-11T10:05:00.000Z" })).toBe("2026-07-11T10:05:00.000Z");
    expect(serverExpectedUpdatedAt({ updated_at: "" })).toBeNull();
  });

  it("re-fetches the order before retrying a conflict", () => {
    const server = source("lib/admin/order-transition-server.ts");
    expect(server).toContain("fetchOrderById(orderId, env)");
    expect(server).toContain("error instanceof AdminRecordConflictError");
    expect(server).toContain("attempt === 0");
  });

  it("routes append-only timeline writes through server CAS helper", () => {
    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain("appendOrderTimelineWithServerCasRetry");
    expect(workflow).not.toContain("expectedUpdatedAt: input.expectedUpdatedAt");
  });

  it("surfaces status validation before RPC in confirm workflow", () => {
    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain('throw new Error(`Order cannot be confirmed from status ${currentStatus}.`);');
  });
});
