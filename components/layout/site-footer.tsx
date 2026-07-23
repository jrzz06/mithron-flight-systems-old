import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { footerContent, type FooterContent } from "@/config/storefront-content";
import { footerOfficialLinks } from "@/config/footer-links";
import { MithronBrandMark } from "@/components/brand/mithron-brand-mark";

function SocialSvg({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SocialSvg {...props}>
      <path
        d="M6.94 7.5H4.5V20h2.44V7.5ZM5.72 4A1.42 1.42 0 1 0 5.72 6.84 1.42 1.42 0 0 0 5.72 4ZM20 12.4c0-2.72-1.45-4.48-3.99-4.48-1.17 0-2.03.64-2.35 1.24V7.5H11.3V20h2.44v-6.55c0-1.73.33-3.4 2.48-3.4 2.12 0 2.15 1.98 2.15 3.51V20H20v-7.6Z"
        fill="currentColor"
      />
    </SocialSvg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SocialSvg {...props}>
      <path
        d="M7.2 2h9.6A5.2 5.2 0 0 1 22 7.2v9.6A5.2 5.2 0 0 1 16.8 22H7.2A5.2 5.2 0 0 1 2 16.8V7.2A5.2 5.2 0 0 1 7.2 2Zm9.6 2H7.2A3.2 3.2 0 0 0 4 7.2v9.6A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2V7.2A3.2 3.2 0 0 0 16.8 4Zm-4.8 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM17.6 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
        fill="currentColor"
      />
    </SocialSvg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SocialSvg {...props}>
      <path
        d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.87.24-1.46 1.5-1.46h1.75V5a23.4 23.4 0 0 0-2.55-.13c-2.53 0-4.25 1.54-4.25 4.37V11H7.3v3h2.7v8h3.5Z"
        fill="currentColor"
      />
    </SocialSvg>
  );
}

function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SocialSvg {...props}>
      <path
        d="M21.6 8.02a2.7 2.7 0 0 0-1.9-1.92C18.02 5.6 12 5.6 12 5.6s-6.02 0-7.7.5A2.7 2.7 0 0 0 2.4 8.02 28.3 28.3 0 0 0 2 12c0 1.33.13 2.66.4 3.98a2.7 2.7 0 0 0 1.9 1.92c1.68.5 7.7.5 7.7.5s6.02 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.92c.27-1.32.4-2.65.4-3.98s-.13-2.66-.4-3.98ZM10.8 14.8V9.2L15.7 12l-4.9 2.8Z"
        fill="currentColor"
      />
    </SocialSvg>
  );
}

const emptyFooterContent: FooterContent = {
  leadTitle: "",
  leadBody: "",
  columns: [],
  legalText: ""
};

function withFooterLeadDefaults(content: FooterContent): FooterContent {
  if (isCmsStrictMode()) return content;
  return {
    leadTitle: content.leadTitle || footerContent.leadTitle,
    leadBody: content.leadBody || footerContent.leadBody,
    contactEmail: content.contactEmail || footerContent.contactEmail,
    contactPhone: content.contactPhone || footerContent.contactPhone,
    legalText: content.legalText || footerContent.legalText,
    columns: content.columns.length ? content.columns : footerContent.columns
  };
}

export function SiteFooter({ content = emptyFooterContent }: { content?: FooterContent }) {
  const resolved = withFooterLeadDefaults(content);

  const linkClassName =
    "transition-colors duration-200 hover:text-white text-white/70 focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded py-0.5 inline-block";
  const footerHeadingClassName =
    "text-xs font-semibold tracking-wider text-white/50 uppercase";
  const footerLinkListClassName = "space-y-2 text-sm leading-6";
  const socialLinkClassName =
    "group flex items-center gap-1.5 rounded py-0.5 text-white/70 transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <footer className="site-footer bg-[var(--ds-footer-bg)] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white font-sans border-t border-white/5" data-testid="site-footer">
      <div className="mx-auto max-w-[min(100%,var(--ds-container))] px-[var(--fluid-page-inline)] py-9 md:py-12">
        
        {/* TOP FOOTER - 4 Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 lg:gap-x-10 items-start">
          
          {/* Column 1 - Brand Info */}
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-start mb-3 focus-visible:outline focus-visible:outline-white rounded" aria-label="Mithron Home">
              <MithronBrandMark />
            </Link>
            <p className="max-w-[42ch] text-sm leading-relaxed text-white/60 text-justify [text-wrap:pretty]">
              {resolved.leadBody}
            </p>
          </div>

          {/* Column 2 - Products / Services */}
          <div className="min-w-0">
            <h3 className={`${footerHeadingClassName} mb-3`}>
              Products / Services
            </h3>
            <ul className={footerLinkListClassName}>
              <li>
                <a href={footerOfficialLinks.mithronSmart} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  Mithron Smart
                </a>
              </li>
              <li>
                <Link href={footerOfficialLinks.mithronStore} className={linkClassName}>
                  Mithron Store
                </Link>
              </li>
              <li>
                <a href={footerOfficialLinks.agrone} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  AGRONE (Agri drones)
                </a>
              </li>
              <li>
                <a href={footerOfficialLinks.zroneo} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  ZRONEO (City Drone App)
                </a>
              </li>
              <li>
                <a href={footerOfficialLinks.droningPlatform} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  Droning
                </a>
              </li>
              <li>
                <a href={footerOfficialLinks.droningLogin} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  Droning sign-in
                </a>
              </li>
              <li>
                <a href={footerOfficialLinks.droneEmi} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  Drone EMI
                </a>
              </li>
              <li>
                <a href={footerOfficialLinks.supplierPortal} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                  For suppliers
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3 - Legal */}
          <div className="min-w-0">
            <h3 className={`${footerHeadingClassName} mb-3`}>
              Legal
            </h3>
            <ul className={footerLinkListClassName}>
              <li>
                <Link href="/contact" className={linkClassName}>
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms-and-conditions" className={linkClassName}>
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/shipping-policy" className={linkClassName}>
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="/cancellation-policy" className={linkClassName}>
                  Cancellation Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4 - Social Media */}
          <div className="min-w-0">
            <h3 className={`${footerHeadingClassName} mb-3`}>
              Social Media
            </h3>
            <ul className={footerLinkListClassName}>
              <li>
                <a
                  href={footerOfficialLinks.linkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClassName}
                  aria-label="Mithron on LinkedIn (opens in a new tab)"
                >
                  <LinkedInIcon className="h-4 w-4 flex-none text-white/70 transition-colors duration-200 group-hover:text-white" />
                  <span className="leading-6">LinkedIn</span>
                </a>
              </li>
              <li>
                <a
                  href={footerOfficialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClassName}
                  aria-label="Mithron on Instagram (opens in a new tab)"
                >
                  <InstagramIcon className="h-4 w-4 flex-none text-white/70 transition-colors duration-200 group-hover:text-white" />
                  <span className="leading-6">Instagram</span>
                </a>
              </li>
              <li>
                <a
                  href={footerOfficialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClassName}
                  aria-label="Mithron on Facebook (opens in a new tab)"
                >
                  <FacebookIcon className="h-4 w-4 flex-none text-white/70 transition-colors duration-200 group-hover:text-white" />
                  <span className="leading-6">Facebook</span>
                </a>
              </li>
              <li>
                <a
                  href={footerOfficialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClassName}
                  aria-label="Mithron on YouTube (opens in a new tab)"
                >
                  <YouTubeIcon className="h-4 w-4 flex-none text-white/70 transition-colors duration-200 group-hover:text-white" />
                  <span className="leading-6">YouTube</span>
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* ADDRESS SECTION - Horizontal row */}
        <div className="border-t border-white/10 mt-8 pt-8 md:mt-10 md:pt-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 lg:gap-x-10 items-start">
            
            {/* Head Office */}
            <div className="min-w-0">
              <h4 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3">
                Mithron India Smart Services Private Limited
              </h4>
              <div className="text-sm leading-relaxed text-white/80 font-normal text-left">
                <p className="type-meta font-semibold tracking-wider text-white/60 uppercase">Head Office</p>
                <address className="not-italic mt-2 space-y-0.5">
                  <div>#35/1 GST Road, Essa Pallavaram</div>
                  <div>(Near Chromepet Saravana Store)</div>
                  <div>Chennai 600043, India</div>
                </address>
              </div>
            </div>

            {/* Franchise Location */}
            <div className="min-w-0">
              <h4 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3">
                Franchise Location
              </h4>
              <address className="text-sm leading-relaxed text-white/80 font-normal not-italic text-left space-y-0.5">
                <div>Commercial Block #1306,</div>
                <div>Asian Sun City,</div>
                <div>B Block,</div>
                <div>Forest Dept Colony,</div>
                <div>Kothaguda,</div>
                <div>Hyderabad,</div>
                <div>Telangana 500084,</div>
                <div>India</div>
              </address>
            </div>

            {/* Service Centers */}
            <div className="min-w-0">
              <h4 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3">
                Service Centers
              </h4>
              <p className="text-sm leading-relaxed text-white/80 font-normal">
                Tiruvannamalai<br />
                Kadalur<br />
                Pudukkottai<br />
                Perambalur<br />
                Kolar
              </p>
            </div>

            {/* Contact */}
            <div className="min-w-0">
              <h4 className="text-xs font-semibold tracking-wider text-white/50 uppercase mb-3">
                Contact
              </h4>
              <div className="text-sm leading-relaxed text-white/80 font-normal flex flex-col gap-4 text-left">
                <div className="flex flex-col gap-2">
                  <p className="type-meta font-semibold tracking-wider text-white/60 uppercase">Phone</p>
                  <div className="flex flex-col gap-1.5">
                    <a
                      href={`tel:${footerOfficialLinks.contactPhones[0]}`}
                      className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
                    >
                      +91 8861304108
                    </a>
                    <a
                      href={`tel:${footerOfficialLinks.contactPhones[1]}`}
                      className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
                    >
                      +91 9591481517
                    </a>
                    <a
                      href={`tel:${footerOfficialLinks.contactPhones[2]}`}
                      className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
                    >
                      +91 8939123421
                    </a>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="type-meta font-semibold tracking-wider text-white/60 uppercase">Email</p>
                  <a
                    href={`mailto:${footerOfficialLinks.contactEmail}`}
                    className="hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded break-words"
                  >
                    {footerOfficialLinks.contactEmail}
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM BAR - Copyright strip */}
        <div className="border-t border-white/10 mt-8 pt-6 flex items-center justify-center text-xs text-white/50">
          <div>
            &copy; 2026 Mithron India Smart Services Pvt. Ltd. All Rights Reserved.
          </div>
        </div>

      </div>
    </footer>
  );
}
