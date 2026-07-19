import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dark enterprise control-plane theme", () => {
  it("scopes the dark operational palette to admin and warehouse control planes", () => {
    const globals = source("app/globals.css");
    const platformStyles = source("app/platform.css");
    const platformShell = source("components/platform/platform-shell.tsx");
    const productsPage = source("app/admin/products/page.tsx");

    expect(platformStyles).toContain('[data-control-plane-theme="dark"]');
    expect(platformStyles).toContain("--platform-bg: #111316");
    expect(platformShell).toContain('data-control-plane-theme="dark"');
    expect(platformShell).toContain('@/app/platform.css');
    expect(productsPage).toContain("platformFieldClass");
    expect(globals).not.toContain("Global dark performance pass");
  });

  it("keeps admin products on compact dark surfaces without blur-heavy modals", () => {
    const productsPage = source("app/admin/products/page.tsx");

    expect(productsPage).toContain("var(--platform-border)");
    expect(productsPage).not.toContain("bg-white/[0.055]");
  });
});
