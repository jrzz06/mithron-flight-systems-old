import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "Cancellation Policy – Mithron",
  description: "Mithron order cancellation guidelines, timelines, and refund process."
};

export default function CancellationPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 md:px-16">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          Cancellation Policy
        </span>
      </nav>

      <p className="type-meta mb-4 text-sm uppercase tracking-widest text-[var(--ds-text-tertiary)]">
        Legal
      </p>
      <h1 className="type-page mb-6 text-4xl font-bold">Cancellation Policy</h1>
      <p className="type-body mb-4 text-[var(--ds-text-secondary)]">
        Last updated: July 2025
      </p>
      <div className="prose prose-neutral max-w-none text-[var(--ds-text-primary)]">
        <p>
          At Mithron, we strive to process and dispatch orders as quickly as possible.
          If you need to cancel your order, please review our cancellation policy guidelines below.
        </p>

        <h2>1. Cancellation Window</h2>
        <ul>
          <li>
            <strong>Standard Products &amp; Spares:</strong> Orders can be cancelled free of charge
            within <strong>24 hours</strong> of placing the order, provided the order has not
            already been shipped.
          </li>
          <li>
            <strong>Shipped Orders:</strong> Once an order has been shipped, it cannot be cancelled.
            In such cases, you will need to follow our <Link href="/refund-policy" className="underline">Refund Policy</Link> upon receiving the item.
          </li>
        </ul>

        <h2>2. Exclusions</h2>
        <p>
          Please note that certain orders are not eligible for cancellation under any circumstances once payment is processed:
        </p>
        <ul>
          <li>Customized drone aircraft or tailored add-ons.</li>
          <li>Special-order spare parts imported specifically for your order.</li>
          <li>Software licensing keys, software packages, or digital products.</li>
        </ul>

        <h2>3. How to Request Cancellation</h2>
        <p>
          To cancel an eligible order:
        </p>
        <ol>
          <li>Send an email to <a href="mailto:dronecare@mithronsmart.com" className="underline">dronecare@mithronsmart.com</a> as soon as possible.</li>
          <li>Include your order ID, account email, and the reason for cancellation in your email.</li>
          <li>Alternatively, you can call us at <a href="tel:+918939123421" className="underline">+91-8939123421</a> to expedite the request.</li>
        </ol>

        <h2>4. Refund Process for Cancelled Orders</h2>
        <p>
          Once your cancellation request is verified and approved, the refund will be initiated to your original payment method:
        </p>
        <ul>
          <li>Approved cancellations will receive a full refund (minus any non-refundable payment gateway transaction charges, if applicable).</li>
          <li>Refunds are processed within <strong>7 to 10 business days</strong>.</li>
          <li>You will receive an email confirmation once the refund has been processed.</li>
        </ul>

        <h2>5. Contact Us</h2>
        <p>
          For any questions or support regarding cancellation requests, please contact our support desk:
          <br />
          Email: <a href="mailto:dronecare@mithronsmart.com" className="underline">dronecare@mithronsmart.com</a>
          <br />
          Phone: <a href="tel:+918939123421" className="underline">+91-8939123421</a>
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
