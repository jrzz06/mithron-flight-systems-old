import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFaqDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("FAQ CMS draft form", () => {
  it("maps FAQ form data into the registered faqs draft workflow input", () => {
    expect(buildFaqDraftFromFormData(formData({
      id: "faq-support",
      scope: "global",
      question: "How do deployments start?",
      answer: "Through a scoped operations review.",
      sort_order: "30",
      is_visible: "on",
      change_summary: "Draft FAQ from admin CMS form"
    }))).toEqual({
      table: "faqs",
      identity: {
        id: "faq-support"
      },
      fields: {
        scope: "global",
        product_slug: null,
        question: "How do deployments start?",
        answer: "<p>Through a scoped operations review.</p>"
      },
      entityId: "faq-support",
      sortOrder: 30,
      isVisible: true,
      changeSummary: "Draft FAQ from admin CMS form"
    });
  });

  it("wires the draft-only FAQ form to the server action and admin CMS workspace", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspaceSource).toContain("data-cms-table=\"faqs\"");
    expect(pageSource).toContain("faqSections");
    expect(pageSource).toContain("faqs-page");
    expect(actionSource).toContain("buildFaqDraftFromFormData");
    expect(actionSource).toContain("saveFaqDraftFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});
