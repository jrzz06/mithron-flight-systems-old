import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin and warehouse dark enterprise palette", () => {
  it("scopes the premium dark palette to control-plane routes only", () => {
    const globals = source("app/globals.css");
    const platformStyles = source("app/platform.css");
    const platformShell = source("components/platform/platform-shell.tsx");
    const parallelLayout = source("components/platform/control-plane-parallel-layout.tsx");
    const controlShell = source("components/admin/control-shell.tsx");
    const warehouseLoading = source("app/warehouse/loading.tsx");

    expect(platformStyles).toContain('[data-control-plane-theme="dark"]');
    expect(platformStyles).toContain("--platform-bg: #111316");
    expect(platformStyles).toContain("--platform-surface: #17191d");
    expect(platformStyles).toContain("--platform-text-primary: #eceef2");
    expect(platformStyles).toContain("--platform-accent: #dce0e6");
    expect(platformStyles).toContain("--platform-accent-text: #131518");
    expect(platformStyles).toContain(".platform-btn-primary");

    expect(platformShell).toContain('data-control-plane-theme="dark"');
    expect(platformShell).toContain('@/app/platform.css');
    expect(parallelLayout).toContain('data-control-plane-theme="dark"');
    expect(controlShell).toContain("data-control-shell-header");
    expect(warehouseLoading).toContain("ControlPlaneContentLoading");

    expect(globals).not.toContain('body[data-control-plane-theme="dark"]');
    expect(source("components/layout/store-shell.tsx")).not.toContain("data-control-plane-theme");
  });
});
