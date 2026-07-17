import { describe, expect, it } from "vitest";
import { mergeHomepageCmsContent } from "@/services/homepage-cms";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";

describe("homepage CMS content", () => {
  it("merges saved testimonials header from admin_settings payload", () => {
    const merged = mergeHomepageCmsContent({
      testimonials: {
        eyebrow: "Customer testimonials",
        title: "Field Feedback",
        titleAccent: "Feedback",
        lead: "Operator feedback from the field.",
        linkLabel: "",
        linkHref: ""
      }
    });

    expect(merged.testimonials.title).toBe("Field Feedback");
    expect(merged.testimonials.titleAccent).toBe("Feedback");
    expect(merged.testimonials.lead).toBe("Operator feedback from the field.");
    expect(merged.testimonials.linkLabel).toBe("");
  });

  it("migrates legacy What Our Clients Say headline to current defaults", () => {
    const merged = mergeHomepageCmsContent({
      testimonials: {
        title: "What Our Clients Say",
        titleAccent: "Our Clients",
        lead: "Hear Directly Our Satisfified Partners"
      }
    });

    expect(merged.testimonials.title).toBe("Customer Testimonial");
    expect(merged.testimonials.titleAccent).toBe("Testimonial");
    expect(merged.testimonials.lead).toBe("Hear Directly From Our Satisfified Partners");
  });

  it("replaces legacy testimonials titles with the current default headline", () => {
    const merged = mergeHomepageCmsContent({
      testimonials: {
        title: "What customers say about our jerus"
      }
    });

    expect(merged.testimonials.title).toBe(getDefaultHomepageCmsContent().testimonials.title);
  });

  it("merges saved testimonials lead copy from admin_settings payload", () => {
    const merged = mergeHomepageCmsContent({
      testimonials: {
        eyebrow: "Customer testimonials",
        title: "Field Feedback",
        titleAccent: "Feedback",
        lead: "Operator feedback from the field.",
        linkLabel: "",
        linkHref: ""
      }
    });

    expect(merged.testimonials.lead).toBe("Operator feedback from the field.");
    expect(merged.testimonials.title).toBe("Field Feedback");
  });

  it("falls back to defaults for missing homepage fields", () => {
    const merged = mergeHomepageCmsContent({});
    expect(merged.testimonials.eyebrow).toBe(getDefaultHomepageCmsContent().testimonials.eyebrow);
    expect(merged.testimonials.title).toBe(getDefaultHomepageCmsContent().testimonials.title);
    expect(merged.testimonials.titleAccent).toBe(getDefaultHomepageCmsContent().testimonials.titleAccent);
    expect(merged.testimonials.lead).toBe(getDefaultHomepageCmsContent().testimonials.lead);
    expect(merged.shelves.droneWorld.title).toBe(getDefaultHomepageCmsContent().shelves.droneWorld.title);
  });
});
