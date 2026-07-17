import Link from "next/link";
import { AdminSection } from "@/components/admin/module-panel";
import { SupplierLiveSync } from "@/components/supplier/supplier-live-sync";
import { StatusPill } from "@/components/platform";
import { relativeTimeLabel, supplierRejectionLabel } from "@/lib/platform/copy";
import { listSupplierProducts } from "@/services/supplier-actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";

type SectionKey = "pending" | "approved" | "rejected";

function submissionSections(products: Awaited<ReturnType<typeof listSupplierProducts>>) {
  const pending = products.filter((product) => String(product.workflow_status ?? "draft") === "pending_review");
  const approved = products.filter((product) => {
    const status = String(product.workflow_status ?? "draft");
    return status === "published" || status === "approved";
  });
  const rejected = products.filter((product) => String(product.workflow_status ?? "draft") === "rejected");

  return [
    {
      key: "pending" as SectionKey,
      title: "Awaiting review",
      description: "Products our team is currently reviewing. You cannot edit them until a decision is made.",
      items: pending
    },
    {
      key: "approved" as SectionKey,
      title: "Live on store",
      description: "Approved products visible to shoppers. Contact us if you need changes to a live listing.",
      items: approved
    },
    {
      key: "rejected" as SectionKey,
      title: "Changes requested",
      description: "Products that need updates before they can go live. Review feedback, make changes, and resubmit.",
      items: rejected
    }
  ];
}

function actionLabel(status: string): string {
  if (status === "rejected") return "Review feedback";
  return "View";
}

function SubmissionList({ items, sectionKey }: { items: Awaited<ReturnType<typeof listSupplierProducts>>; sectionKey: SectionKey }) {
  if (!items.length) {
    return <p className="text-sm text-[var(--platform-text-secondary)]">No products in this section.</p>;
  }

  return (
    <div className="grid gap-2">
      {items.map((product) => {
        const status = String(product.workflow_status ?? "draft");
        const slug = String(product.slug ?? "");
        const updatedAt = typeof product.updated_at === "string" ? product.updated_at : "";
        return (
          <div
            key={slug}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-[var(--platform-text-primary)]">{String(product.name ?? slug)}</p>
              {updatedAt ? (
                <p className="text-xs text-[var(--platform-text-muted)]">Updated {relativeTimeLabel(updatedAt)}</p>
              ) : null}
              {sectionKey === "rejected" && product.rejection_reason ? (
                <div className="mt-1">
                  <p className="text-xs font-medium text-rose-300">{supplierRejectionLabel()}</p>
                  <p className="text-xs text-rose-200/90">{String(product.rejection_reason)}</p>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={status} />
              <Link href={`/supplier/products/${encodeURIComponent(slug)}/edit`} className="text-sm text-[var(--platform-accent)]">
                {actionLabel(status)}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function SupplierSubmissionsPage() {
  const [context, policy] = await Promise.all([
    getCurrentAuthContext(),
    getAdminSettingsPolicy()
  ]);
  const products = context.userId ? await listSupplierProducts(context.userId) : [];
  const sections = submissionSections(products);

  return (
    <div className="grid gap-5">
      <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <p className="text-sm leading-relaxed text-[var(--platform-text-secondary)]">
        Track products you have sent for review and see what needs your attention.
      </p>
      {sections.map((section) => (
        <AdminSection
          key={section.key}
          title={section.title}
          description={`${section.items.length} product${section.items.length === 1 ? "" : "s"} — ${section.description}`}
        >
          <SubmissionList items={section.items} sectionKey={section.key} />
        </AdminSection>
      ))}
    </div>
  );
}
