import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("login hero performance tiers", () => {
  it("resolves adaptive hero tiers for low-end and capable devices", () => {
    const tier = source("lib/login-hero-tier.ts");
    const hero = source("app/login/login-hero-background.tsx");

    expect(tier).toContain('export type LoginHeroTier = "lite" | "standard" | "premium"');
    expect(tier).toContain("saveData");
    expect(tier).toContain("hardwareConcurrency");
    expect(hero).toContain('"use client"');
    expect(hero).toContain('data-hero-tier={tier}');
    expect(hero).toContain("useSyncExternalStore");
    expect(hero).toContain('sizes="(max-width: 1280px) 100vw, 1920px"');
    expect(hero).toContain("backgroundImage");
    expect(hero).not.toContain("unoptimized");
  });

  it("styles subject focus and tier-aware motion in login css", () => {
    const css = source("app/login/login.module.css");

    expect(css).toContain("--login-hero-focus-x");
    expect(css).toContain(".heroSubjectLift");
    expect(css).toContain('data-hero-tier="premium"');
    expect(css).toContain("saturate(1.08)");
    expect(css).toContain("background-size: cover");
    expect(css).toContain("contain: layout paint style");
  });
});
