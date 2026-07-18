import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contactRequestNextStepLabel,
  contactRequestMoreActions,
  enquiryMoreActions,
  enquiryNextStepLabel
} from "@/lib/admin/queue-workflow";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("admin queue workflow (leads rebuild)", () => {
  it("exposes only push/delete-oriented next steps", () => {
    expect(enquiryNextStepLabel()).toBe("Push to order or delete");
    expect(enquiryMoreActions()).toEqual(["cancel"]);
    expect(contactRequestMoreActions()).toEqual(["reject"]);
    expect(contactRequestNextStepLabel({ status: "new" })).toBe("Push to order or delete");
    expect(contactRequestNextStepLabel({ status: "converted", converted_order_id: "ord-1" })).toBe("Order created");
  });

  it("does not expose legacy in-progress / complete / not-going-ahead actions", () => {
    const workflow = source("lib/admin/queue-workflow.ts");
    expect(workflow).not.toContain("Mark as in progress");
    expect(workflow).not.toContain("Not going ahead");
    expect(workflow).not.toContain("markInProgress");
  });
});
