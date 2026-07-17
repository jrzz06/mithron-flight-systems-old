import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HERO_BANNER_CMS_TABLE,
  buildHeroBannerDraftInput,
  archiveHeroBannerWorkflow,
  publishHeroBannerWorkflow,
  saveHeroBannerDraftWorkflow
} from "@/services/cms-admin-workflows";
import { CmsValidationError } from "@/services/cms-crud";

const actorId = "00000000-0000-0000-0000-000000000001";
const now = "2026-05-24T00:00:00.000Z";

const heroInput = {
  id: "ag10-arrival",
  actorId,
  productSlug: "source-agri-kisan-drone-small-8-liter",
  title: "Mithron Precision Agriculture",
  subtitle: "Field-ready autonomous coverage.",
  ctaLabel: "Plan deployment",
  href: "/product/source-agri-kisan-drone-small-8-liter",
  image: {
    src: "/assets/hero/hero-slide-01.webp",
    alt: "Mithron agriculture drone",
    width: 1448,
    height: 1086,
    local: true
  },
  poster: {
    src: "/assets/hero/hero-slide-01.webp",
    alt: "Mithron agriculture drone",
    width: 1448,
    height: 1086,
    local: true
  },
  theme: "light" as const,
  composition: { mode: "full-bleed" },
  sortOrder: 10,
  isVisible: true,
  now,
  changeSummary: "Draft agriculture hero"
};

describe("hero banner CMS workflows", () => {
  it("builds hero draft inputs against the canonical CMS table and strips protected fields", () => {
    const draft = buildHeroBannerDraftInput({
      ...heroInput,
      fields: {
        status: "published",
        revision: 99,
        updated_by: "spoofed"
      }
    });

    expect(HERO_BANNER_CMS_TABLE).toBe("hero_banners");
    expect(draft).toMatchObject({
      table: "hero_banners",
      actorId,
      identity: { id: "ag10-arrival" },
      sortOrder: 10,
      isVisible: true,
      now
    });
    expect(draft.fields).toMatchObject({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      title: "Mithron Precision Agriculture",
      subtitle: "Field-ready autonomous coverage.",
      cta_label: "Plan deployment",
      href: "/product/source-agri-kisan-drone-small-8-liter",
      image: heroInput.image,
      poster: heroInput.poster,
      theme: "light",
      composition: { mode: "full-bleed" }
    });
    expect(draft.fields).not.toHaveProperty("status");
    expect(draft.fields).not.toHaveProperty("revision");
    expect(draft.fields).not.toHaveProperty("updated_by");
  });

  it("saves a draft through permission-gated CMS helpers without allocating a local revision", async () => {
    const saveDraft = vi.fn().mockResolvedValue({
      id: heroInput.id,
      status: "draft",
      title: heroInput.title
    });

    const record = await saveHeroBannerDraftWorkflow(heroInput, {
      saveDraft
    });

    expect(record).toMatchObject({ id: heroInput.id, status: "draft" });
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      table: "hero_banners",
      conflictColumn: "id",
      actorId,
      identity: { id: heroInput.id }
    }));
  });

  it("publishes and archives hero banners through the atomic mutation helper", async () => {
    const publishRecord = vi.fn().mockResolvedValue({
      id: heroInput.id,
      revision: 4,
      status: "published"
    });
    const archiveRecord = vi.fn().mockResolvedValue({
      id: heroInput.id,
      revision: 5,
      status: "archived"
    });

    await publishHeroBannerWorkflow({
      id: heroInput.id,
      actorId,
      now,
      changeSummary: "Publish hero"
    }, {
      publishRecord
    });

    await archiveHeroBannerWorkflow({
      id: heroInput.id,
      actorId,
      now,
      changeSummary: "Archive hero"
    }, {
      archiveRecord
    });

    expect(publishRecord).toHaveBeenCalledWith({
      table: "hero_banners",
      idColumn: "id",
      idValue: heroInput.id,
      actorId,
      now,
      changeSummary: "Publish hero",
      requestId: null
    });
    expect(archiveRecord).toHaveBeenCalledWith({
      table: "hero_banners",
      idColumn: "id",
      idValue: heroInput.id,
      actorId,
      now,
      changeSummary: "Archive hero",
      requestId: null
    });
  });

  it("rejects unsafe hero payloads before admin service-role writes", async () => {
    expect(() => buildHeroBannerDraftInput({
      ...heroInput,
      actorId: "",
      title: ""
    })).toThrow(CmsValidationError);

    await expect(saveHeroBannerDraftWorkflow({
      ...heroInput,
      image: { src: "", alt: "" }
    }, {
      saveDraft: vi.fn()
    })).rejects.toThrow(CmsValidationError);
  });

  it("keeps server actions thin and actor-derived", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(source).toContain("\"use server\"");
    expect(source).toContain("getCurrentAuthContext");
    expect(source).toContain("saveHeroBannerDraftWorkflow");
    expect(source).toContain("publishHeroBannerWorkflow");
    expect(source).toContain("archiveHeroBannerWorkflow");
    expect(source).not.toContain("actorId: input.actorId");
  });
});
