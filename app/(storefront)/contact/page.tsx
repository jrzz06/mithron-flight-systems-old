import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Home, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnquiryForm } from "@/components/contact/enquiry-form";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { footerOfficialLinks } from "@/config/footer-links";
import { createClient } from "@/lib/server";
import { getPublicCmsSnapshot } from "@/services/cms";

export const metadata: Metadata = {
  title: "Contact Us – Mithron",
  description: "Get in touch with the Mithron team for sales, support, and setup enquiries."
};

export default async function ContactPage() {
  const [cms, supabase] = await Promise.all([getPublicCmsSnapshot(), createClient()]);
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  let profilePhone = "";
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    profilePhone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
  }

  const contactEmail = cms.footer.contactEmail?.trim() || footerOfficialLinks.contactEmail;
  const contactPhone =
    cms.footer.contactPhone?.trim() || footerOfficialLinks.contactPhones.join(" , ");
  const intro = cms.footer.leadBody?.trim()
    || "Tell us what you need and our team will follow up with product fit, pricing, and next steps.";

  const contactCards = [
    { label: "Sales", value: contactEmail, icon: Mail },
    { label: "Support", value: contactPhone, icon: Phone }
  ];

  return (
    <main className="surface-page inner-page min-h-screen">
      <section className="mx-auto max-w-[min(100%,var(--ds-container-checkout))]">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500 animate-fade-in">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="font-medium text-slate-950" aria-current="page">
            Contact Us
          </span>
        </nav>

        <p className="type-meta text-slate-500">Contact</p>
        <div className="mt-4 grid gap-8 md:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h1 className="type-page max-w-2xl">Talk to Mithron.</h1>
            <EditorRenderedContent html={intro} className="type-subtitle mt-6 max-w-2xl text-slate-600" />
            <Button asChild className="mt-8">
              <Link href="/products">Shop products</Link>
            </Button>
            <div className="mt-8 grid gap-3">
              {contactCards.map(({ label, value, icon: Icon }) => (
                <article key={label} className="flex items-center gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5">
                  <span className="grid size-11 place-items-center rounded-full bg-black text-white">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="type-meta text-slate-500">{label}</p>
                    <p className="mt-1 text-base font-semibold text-[#0f172a]">{value}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <EnquiryForm defaultEmail={email} defaultPhone={profilePhone} isGuest={!userId} />
        </div>
      </section>
    </main>
  );
}
