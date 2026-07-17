import type { ReactNode } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/platform";
import { relativeTimeLabel } from "@/lib/platform/copy";
import { listAdminEnquiries } from "@/services/enquiries";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function openEnquiries(enquiries: Awaited<ReturnType<typeof listAdminEnquiries>>) {
  return enquiries.filter((enquiry) => !["converted", "lost", "closed"].includes(text(enquiry.status, "new")));
}

function QueuePanel({
  title,
  href,
  emptyLabel,
  children
}: {
  title: string;
  href: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const hasContent = Boolean(children);
  return (
    <article className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
      <div className="flex items-center justify-between border-b border-[var(--platform-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">{title}</h3>
        <Link href={href} className="text-xs font-medium text-[var(--platform-accent)]">View all</Link>
      </div>
      <div className="overflow-x-auto p-2">
        {hasContent ? children : <p className="px-2 py-6 text-sm text-[var(--platform-text-muted)]">{emptyLabel}</p>}
      </div>
    </article>
  );
}

export async function AdminDashboardEnquiryQueue() {
  const enquiries = await listAdminEnquiries();
  const queueEnquiries = openEnquiries(enquiries).slice(0, 8);

  return (
    <QueuePanel title="Customer enquiries" href="/admin/enquiries" emptyLabel="No open enquiries.">
      {queueEnquiries.length ? (
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--platform-border)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {queueEnquiries.map((enquiry) => (
              <tr key={String(enquiry.id)} className="border-b border-[var(--platform-border)] last:border-b-0">
                <td className="px-3 py-2 text-[var(--platform-text-primary)]">{text(enquiry.customer_email, "—")}</td>
                <td className="px-3 py-2 text-[var(--platform-text-secondary)]">{text(enquiry.subject, "Enquiry")}</td>
                <td className="px-3 py-2"><StatusPill status={text(enquiry.status, "new")} /></td>
                <td className="px-3 py-2 text-xs text-[var(--platform-text-muted)]">{relativeTimeLabel(text(enquiry.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </QueuePanel>
  );
}
