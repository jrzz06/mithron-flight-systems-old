import { describe, expect, it } from "vitest";
import { sameActiveResources } from "@/components/admin/realtime/admin-realtime-provider";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin realtime registration stability", () => {
  it("sameActiveResources treats identical key lists as equal", () => {
    expect(sameActiveResources(["enquiries"], ["enquiries"])).toBe(true);
    expect(sameActiveResources(["enquiries", "orders"], ["enquiries", "orders"])).toBe(true);
    expect(sameActiveResources([], [])).toBe(true);
  });

  it("sameActiveResources detects length or order changes", () => {
    expect(sameActiveResources(["enquiries"], ["enquiries", "orders"])).toBe(false);
    expect(sameActiveResources(["enquiries", "orders"], ["orders", "enquiries"])).toBe(false);
    expect(sameActiveResources(["enquiries"], ["orders"])).toBe(false);
  });

  it("syncs active resources only when keys change and registers via stable callback", () => {
    const provider = source("components/admin/realtime/admin-realtime-provider.tsx");

    expect(provider).toContain("export function sameActiveResources");
    expect(provider).toContain("sameActiveResources(prev, next) ? prev : next");
    expect(provider).toContain("const registerResource = realtime?.registerResource");
    expect(provider).toContain("[enabled, registerResource, resource]");
    expect(provider).not.toMatch(/useEffect\(\(\) => \{\s*if \(!enabled \|\| !realtime\) return undefined;\s*return realtime\.registerResource\(resource\);\s*\}, \[enabled, realtime, resource\]\)/);
  });
});
