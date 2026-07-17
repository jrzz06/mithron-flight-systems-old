import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const ACTION_FILES = [
  "app/admin/reviews/actions.ts",
  "app/admin/blog/actions.ts",
  "app/admin/press/actions.ts",
  "app/admin/warehouses/actions.ts",
  "app/admin/contact-requests/actions.ts",
  "app/admin/enquiries/actions.ts",
  "app/admin/cms/actions.ts",
  "app/admin/products/actions.ts"
] as const;

const WAREHOUSE_PAGE_ACTION_WRAPPERS = [
  "app/warehouse/transfers/page.tsx",
  "app/warehouse/orders/page.tsx",
  "app/warehouse/fulfillment/page.tsx",
  "app/warehouse/fulfillment/[id]/page.tsx",
  "app/warehouse/fulfillment/[id]/products/[itemId]/page.tsx"
] as const;

describe("server action redirect hygiene", () => {
  it("uses isNextRedirect in every admin action module that catches redirects", () => {
    for (const path of ACTION_FILES) {
      const actions = source(path);
      expect(actions, path).toContain("isNextRedirect");
      expect(actions, path).not.toMatch(/\.message\s*===\s*["']NEXT_REDIRECT["']/);
    }
  });

  it("rethrows navigation errors from warehouse inline action wrappers", () => {
    for (const path of WAREHOUSE_PAGE_ACTION_WRAPPERS) {
      const page = source(path);
      expect(page, path).toContain("isActionNavigationError");
      expect(page, path).toMatch(/if \(isActionNavigationError\(error\)\) throw error/);
    }
  });

  it("keeps the fragile message check only as a fallback inside isNextRedirect", () => {
    const helper = source("lib/server-action-feedback.ts");
    expect(helper).toContain("digest.startsWith(\"NEXT_REDIRECT\")");
    expect(helper).toContain('error.message === "NEXT_REDIRECT"');

    const navigationHelper = source("lib/server-action-errors.ts");
    expect(navigationHelper).toContain("isNextRedirect");
    expect(navigationHelper).toContain("return isNextRedirect(error)");
  });

  it("does not clear CMS dirty state on submit before the server action finishes", () => {
    const sectionEditor = source("features/admin/cms/cms-section-editor.tsx");
    const visualWorkspace = source("features/admin/cms/cms-visual-workspace.tsx");
    expect(sectionEditor).not.toMatch(/onSubmit=\{markSaved\}/);
    expect(visualWorkspace).not.toMatch(/onSubmit=\{markSubmitted\}/);
  });
});
