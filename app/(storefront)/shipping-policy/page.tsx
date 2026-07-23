import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Heading } from "@/components/ui/heading";

export const metadata: Metadata = {
  title: "Shipping Policy – Mithron",
  description: "Delivery timelines, shipping rates, and logistics information for Mithron orders."
};

export default function ShippingPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 md:px-16">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          Shipping Policy
        </span>
      </nav>

      <p className="type-meta mb-4 text-sm uppercase tracking-widest text-[var(--ds-text-tertiary)]">
        Legal
      </p>
      <Heading as="h1" variant="page" className="mb-6">Shipping Policy</Heading>
      <p className="type-body mb-4 text-[var(--ds-text-secondary)]">
        Last updated: July 2025
      </p>
      <div className="prose prose-neutral max-w-none text-[var(--ds-text-primary)]">
        <p>
          Mithron ships across India. Please review the following information
          about delivery timelines, rates, and special handling for drone products.
        </p>

        <h2>1. Processing Time</h2>
        <p>
          Orders are processed within <strong>1–3 business days</strong> of payment confirmation.
          Custom or high-volume orders may require additional processing time — our team will
          contact you if this applies.
        </p>

        <h2>2. Delivery Timelines</h2>
        <ul>
          <li>
            <strong>Metro cities</strong> (Chennai, Bangalore, Mumbai, Delhi, Hyderabad,
            Pune): 3–5 business days.
          </li>
          <li>
            <strong>Tier 2 &amp; 3 cities</strong>: 5–8 business days.
          </li>
          <li>
            <strong>Remote &amp; rural areas</strong>: 7–12 business days.
          </li>
        </ul>
        <p>
          These are estimated timelines and may vary based on carrier availability and external
          factors.
        </p>

        <h2>3. Shipping Charges</h2>
        <p>
          Shipping charges are calculated at checkout based on the delivery location and order
          weight. Drone aircraft may attract additional handling charges due to size and
          fragility requirements.
        </p>

        <h2>4. Special Handling — Drone Aircraft</h2>
        <p>
          All drone aircraft are packed in reinforced protective packaging. Lithium battery
          shipments comply with DGCA and IATA regulations. Some battery types may be shipped
          separately due to transport regulations.
        </p>

        <h2>5. Tracking</h2>
        <p>
          Once your order is shipped, you will receive a tracking number via email and SMS.
          You can also track your order using our{" "}
          <Link href="/track-order" className="underline">
            order tracking page
          </Link>
          .
        </p>

        <h2>6. Delivery Issues</h2>
        <p>
          If your order is delayed beyond the estimated delivery window or arrives damaged,
          contact us at{" "}
          <a href="mailto:dronecare@mithronsmart.com" className="underline">
            dronecare@mithronsmart.com
          </a>{" "}
          immediately. Keep the original packaging for inspection purposes.
        </p>

        <h2>7. Contact</h2>
        <p>
          For shipping queries, reach us at{" "}
          <a href="mailto:dronecare@mithronsmart.com" className="underline">
            dronecare@mithronsmart.com
          </a>{" "}
          or call{" "}
          <a href="tel:+918939123421" className="underline">
            +91-8939123421
          </a>
          .
        </p>
      </div>

      <div className="mt-12 border-t border-[var(--ds-border)] pt-8">
        <Link
          href="/"
          className="text-sm text-[var(--ds-text-secondary)] underline hover:text-[var(--ds-text-primary)]"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
