import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin leads reports workflow", () => {
  it("uses the unified leads panel instead of enquiry/contact queues", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/leads/page.tsx"), "utf8");
    const queue = readFileSync(join(process.cwd(), "components/admin/admin-lead-queue.tsx"), "utf8");
    const workflow = readFileSync(join(process.cwd(), "lib/admin/queue-workflow.ts"), "utf8");

    expect(page).toContain("AdminLeadQueue");
    expect(queue).toContain("Push to Order");
    expect(queue).toContain("Delete");
    expect(queue).not.toContain("Mark as in progress");
    expect(queue).not.toContain("Progress note");
    expect(queue).not.toContain("Completion note");
    expect(workflow).not.toContain("Not going ahead");
    expect(workflow).not.toContain("Mark ready for order");
  });
});
