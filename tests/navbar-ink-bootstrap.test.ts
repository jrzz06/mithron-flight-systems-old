import { describe, expect, it } from "vitest";
import {
  applyNavbarInkToDocument,
  getNavbarInkBootstrapInlineScript,
  resolveBootstrapNavbarTone
} from "@/lib/navbar-ink-document";
import { NAVBAR_INK_STYLE_VARS } from "@/lib/navbar-ink-vars";

describe("navbar ink bootstrap", () => {
  it("resolves bootstrap tone from pathname", () => {
    expect(resolveBootstrapNavbarTone("/")).toBe("dark");
    expect(resolveBootstrapNavbarTone("/category/agri-drones")).toBe("light");
    expect(resolveBootstrapNavbarTone("/agriculture")).toBe("light");
    expect(resolveBootstrapNavbarTone("/products")).toBe("dark");
  });

  it("emits a blocking inline script that resolves tone from pathname", () => {
    const script = getNavbarInkBootstrapInlineScript();

    expect(script).toContain('e.setAttribute("data-nav-ink",t)');
    expect(script).toContain('e.setAttribute("data-nav-chrome"');
    expect(script).toContain("location.pathname");
    expect(script).toContain("/category/agri-drones");
    expect(script).toContain('--adaptive-navbar-ink');
  });

  it("applies ink CSS variables to the document root", () => {
    const root = {
      attributes: {} as Record<string, string>,
      style: {
        properties: {} as Record<string, string>,
        setProperty(name: string, value: string) {
          this.properties[name] = value;
        }
      },
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      }
    };

    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: root
      }
    });

    try {
      applyNavbarInkToDocument("light");
      expect(root.attributes["data-nav-ink"]).toBe("light");
      expect(root.style.properties["--adaptive-navbar-ink"]).toBe(NAVBAR_INK_STYLE_VARS.light["--adaptive-navbar-ink"]);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
  });
});
