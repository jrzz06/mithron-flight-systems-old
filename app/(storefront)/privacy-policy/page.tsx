import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Heading } from "@/components/ui/heading";

export const metadata: Metadata = {
  title: "Privacy Policy – Mithron",
  description: "How Mithron India Smart Services Private Limited collects, uses, and protects your personal data."
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 md:px-16">
      <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <Home className="size-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Home</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-slate-950" aria-current="page">
          Privacy Policy
        </span>
      </nav>

      <p className="type-meta mb-4 text-sm uppercase tracking-widest text-[var(--ds-text-tertiary)]">
        Legal
      </p>
      <Heading as="h1" variant="page" className="mb-6">Privacy Policy</Heading>
      <p className="type-body mb-4 text-[var(--ds-text-secondary)]">
        Last updated: July 2025
      </p>
      <div className="prose prose-neutral max-w-none text-[var(--ds-text-primary)]">
        <h2>A Legal Disclaimer</h2>
        <p>
          The explanations and information provided on this page are only general and high-level explanations and information on how to write your own document of a Privacy Policy. You should not rely on this article as legal advice or as recommendations regarding what you should actually do, because we cannot know in advance what are the specific privacy policies you wish to establish between your business and your customers and visitors. We recommend that you seek legal advice to help you understand and to assist you in the creation of your own Privacy Policy.
        </p>

        <h2>Privacy Policy - the basics</h2>
        <p>
          Having said that, a privacy policy is a statement that discloses some or all of the ways a website collects, uses, discloses, processes, and manages the data of its visitors and customers. It usually also includes a statement regarding the website’s commitment to protecting its visitors’ or customers’ privacy, and an explanation about the different mechanisms the website is implementing in order to protect privacy.
        </p>
        <p>
          Different jurisdictions have different legal obligations of what must be included in a Privacy Policy. You are responsible to make sure you are following the relevant legislation to your activities and location.
        </p>

        <h2>What to include in the Privacy Policy</h2>
        <p>
          Generally speaking, a Privacy Policy often addresses these types of issues: the types of information the website is collecting and the manner in which it collects the data; an explanation about why is the website collecting these types of information; what are the website’s practices on sharing the information with third parties; ways in which your visitors and customers can exercise their rights according to the relevant privacy legislation; the specific practices regarding minors’ data collection; and much, much more.
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
