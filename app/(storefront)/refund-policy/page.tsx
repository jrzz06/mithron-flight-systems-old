import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Heading } from "@/components/ui/heading";

export const metadata: Metadata = {
  title: "Refund Policy – Mithron",
  description: "Mithron returns, replacements, and refund policy."
};

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 md:px-16">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          Refund Policy
        </span>
      </nav>

      <p className="type-meta mb-4 text-sm uppercase tracking-widest text-[var(--ds-text-tertiary)]">
        Legal
      </p>
      <Heading as="h1" variant="page" className="mb-6">Refund Policy</Heading>
      <p className="type-body mb-4 text-[var(--ds-text-secondary)]">
        Last updated: July 2025
      </p>
      <div className="prose prose-neutral max-w-none text-[var(--ds-text-primary)]">
        <p>
          At Mithron, we are committed to ensuring you receive the correct
          products in excellent condition. Please read this policy before placing an order.
        </p>

        <h2>1. Eligibility for Returns</h2>
        <ul>
          <li>Items must be returned within <strong>7 days</strong> of delivery.</li>
          <li>Products must be unused, undamaged, and in original packaging with all accessories.</li>
          <li>Proof of purchase (order confirmation or invoice) is required.</li>
        </ul>

        <h2>2. Non-Returnable Items</h2>
        <ul>
          <li>Drone aircraft that have been flown or assembled.</li>
          <li>Software licences and digital products.</li>
          <li>Custom or special-order products.</li>
          <li>Items damaged due to misuse or accidents.</li>
        </ul>

        <h2>3. Replacement Policy</h2>
        <p>
          If you receive a defective or incorrect item, we will replace it at no additional cost.
          Raise a replacement request within 48 hours of delivery by contacting our team at{" "}
          <a href="mailto:dronecare@mithronsmart.com" className="underline">
            dronecare@mithronsmart.com
          </a>
          .
        </p>

        <h2>4. Refund Processing</h2>
        <p>
          Approved refunds are processed within <strong>7–10 business days</strong> to the
          original payment method. Bank transfer timelines may vary.
        </p>

        <h2>5. How to Initiate a Return</h2>
        <ol>
          <li>Email us at dronecare@mithronsmart.com with your order number and reason.</li>
          <li>Our team will review and approve the request within 48 hours.</li>
          <li>Ship the item to our Chennai office using a trackable courier.</li>
          <li>Refund or replacement will be processed upon receipt and inspection.</li>
        </ol>

        <h2>6. Contact</h2>
        <p>
          For return or refund assistance, reach us at{" "}
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
