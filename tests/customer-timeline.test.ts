import { describe, expect, it } from "vitest";
import { buildCustomerTimeline } from "@/services/customer-timeline";
import {
  buildCustomerProgressSteps,
  currentCustomerProgressLabel,
  customerOrderSourceLabel,
  resolveCustomerSource
} from "@/lib/orders/lifecycle";

describe("customer timeline", () => {
  it("merges enquiry, contact, and order events chronologically", () => {
    const timeline = buildCustomerTimeline({
      enquiry: {
        created_at: "2026-01-01T10:00:00.000Z",
        payload: {
          timeline: [{
            at: "2026-01-02T10:00:00.000Z",
            action: "contacted",
            summary: "Team reached out"
          }]
        }
      },
      contactRequest: {
        created_at: "2026-01-01T09:00:00.000Z",
        subject: "Consultation"
      },
      order: {
        created_at: "2026-01-03T10:00:00.000Z",
        status: "confirmed",
        payment_status: "succeeded",
        fulfillment_status: "pending",
        timeline: [{
          at: "2026-01-03T11:00:00.000Z",
          event: "admin_confirm",
          status: "confirmed",
          note: "Approved"
        }]
      }
    });

    expect(timeline.length).toBeGreaterThanOrEqual(4);
    expect(timeline[0].kind).toBe("contact");
    expect(timeline.some((entry) => entry.kind === "enquiry")).toBe(true);
    expect(timeline.some((entry) => entry.kind === "order")).toBe(true);
    for (let index = 1; index < timeline.length; index += 1) {
      expect(new Date(timeline[index - 1].at).getTime()).toBeLessThanOrEqual(new Date(timeline[index].at).getTime());
    }
  });
});

describe("customer progress tracker", () => {
  it("detects enquiry, checkout, and paid order sources", () => {
    expect(resolveCustomerSource({ channel: "enquiry" })).toBe("enquiry");
    expect(resolveCustomerSource({ channel: "checkout", metadata: {} })).toBe("checkout");
    expect(resolveCustomerSource(
      { channel: "checkout", metadata: {} },
      "pi_test_123"
    )).toBe("paid");
    expect(customerOrderSourceLabel({ channel: "checkout" }, "pi_test_123")).toBe("Paid Order");
  });

  it("builds four customer-friendly steps for checkout orders", () => {
    const steps = buildCustomerProgressSteps({
      channel: "checkout",
      status: "assigned",
      payment_status: "requires_payment",
      fulfillment_status: "processing",
      created_at: "2026-01-01T10:00:00.000Z"
    });

    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.label)).toEqual([
      "Order Placed",
      "Order Confirmed",
      "Dispatched",
      "Delivered"
    ]);
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("current");
    expect(steps[2].state).toBe("upcoming");
    expect(currentCustomerProgressLabel({
      channel: "checkout",
      status: "assigned",
      fulfillment_status: "processing"
    })).toBe("Order Confirmed");
  });

  it("marks delivered checkout orders as fully complete", () => {
    const steps = buildCustomerProgressSteps({
      channel: "checkout",
      status: "delivered",
      payment_status: "succeeded",
      fulfillment_status: "delivered",
      created_at: "2026-01-01T10:00:00.000Z"
    });

    expect(steps.every((step) => step.state === "done")).toBe(true);
    expect(currentCustomerProgressLabel({
      channel: "checkout",
      status: "delivered",
      fulfillment_status: "delivered"
    })).toBe("Delivered");
  });

  it("uses enquiry-specific first step labels", () => {
    const steps = buildCustomerProgressSteps(
      {
        channel: "enquiry",
        status: "confirmed",
        payment_status: "requires_payment",
        fulfillment_status: "pending",
        created_at: "2026-01-03T10:00:00.000Z"
      },
      null,
      { enquiryCreatedAt: "2026-01-01T10:00:00.000Z" }
    );

    expect(steps[0].label).toBe("Enquiry Submitted");
    expect(steps[0].completedAt).toBe("2026-01-01T10:00:00.000Z");
    expect(steps[1].state).toBe("current");
  });

  it("shows dispatched and tracking-ready progress for shipped orders", () => {
    const steps = buildCustomerProgressSteps({
      channel: "checkout",
      status: "dispatched",
      payment_status: "succeeded",
      fulfillment_status: "shipped",
      created_at: "2026-01-01T10:00:00.000Z"
    });

    expect(steps[2].label).toBe("Dispatched");
    expect(steps[2].state).toBe("current");
    expect(steps[3].state).toBe("upcoming");
  });
});
