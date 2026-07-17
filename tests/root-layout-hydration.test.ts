import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("root layout hydration resilience", () => {
  it("suppresses expected document-level mismatches from browser extensions", () => {
    const layout = source("app/layout.tsx");

    expect(layout).toContain("<html");
    expect(layout).toContain("<body");
    expect(layout).toContain("suppressHydrationWarning");
  });
});
