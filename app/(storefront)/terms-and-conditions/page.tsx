import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms & Conditions – Mithron",
  description: "Terms and conditions governing use of the Mithron storefront."
};

export default function TermsAndConditionsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 md:px-16">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          Terms &amp; Conditions
        </span>
      </nav>

      <p className="type-meta mb-4 text-sm uppercase tracking-widest text-[var(--ds-text-tertiary)]">
        Legal
      </p>
      <h1 className="type-page mb-6 text-4xl font-bold">Terms &amp; Conditions</h1>
      <p className="type-body mb-4 text-[var(--ds-text-secondary)]">
        Last updated: July 2025
      </p>
      <div className="prose prose-neutral max-w-none text-[var(--ds-text-primary)]">
        <p>
          By accessing or purchasing from the Mithron storefront
          (store.mithronsmart.com), you agree to these Terms &amp; Conditions. Please read them
          carefully before placing an order.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 18 years old to place orders. By using this store you confirm
          you have the legal capacity to enter into binding contracts under applicable Indian law.
        </p>

        <h2>2. Products &amp; Pricing</h2>
        <p>
          All prices are listed in Indian Rupees (INR) and are inclusive or exclusive of GST as
          indicated on each product page. Mithron reserves the right to change prices without
          prior notice. Orders are confirmed only upon successful payment.
        </p>

        <h2>3. Orders &amp; Cancellations</h2>
        <p>
          Once an order is placed and payment confirmed, cancellations are subject to our Refund
          Policy. We reserve the right to cancel any order due to product unavailability, pricing
          errors, or suspected fraud.
        </p>

        <h2>4. Intellectual Property</h2>
        <p>
          All content on this storefront — including text, images, product descriptions, and
          branding — is the property of Mithron India Smart Services Pvt. Ltd. and may not be
          reproduced without written permission.
        </p>

        <h2>5. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Mithron is not liable for indirect, incidental,
          or consequential damages arising from the use of our products or services.
        </p>

        <h2>6. Governing Law</h2>
        <p>
          These Terms are governed by the laws of India. Any disputes shall be subject to the
          exclusive jurisdiction of courts in Chennai, Tamil Nadu.
        </p>

        <h2>7. Contact</h2>
        <p>
          For any questions regarding these Terms, contact us at{" "}
          <a href="mailto:dronecare@mithronsmart.com" className="underline">
            dronecare@mithronsmart.com
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
