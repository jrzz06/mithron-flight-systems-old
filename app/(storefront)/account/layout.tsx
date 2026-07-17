import { redirect } from "next/navigation";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AccountNav } from "@/components/account";
import {
  defaultPathForRole,
  isControlPanelRole,
  workspaceLabelForRole
} from "@/lib/auth/access-control";
import { getCurrentAuthContext } from "@/services/auth";
import "@/app/account.css";

export const dynamic = "force-dynamic";

const customerLinks = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/enquiries", label: "Enquiries" },
  { href: "/account/profile", label: "Profile & security" }
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account");

  const role = context.role ?? "user";
  const userId = context.userId;
  const isStaff = isControlPanelRole(role);
  const workspaceHref = isStaff ? defaultPathForRole(role) : null;
  const hubLabel = isStaff ? workspaceLabelForRole(role) : "My Account";
  const navLinks = isStaff
    ? [{ href: "/account/security", label: "Security" }]
    : customerLinks;

  return (
    <main className="account-hub surface-page min-h-screen px-4 py-20 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--account-ink-muted)]">
              {isStaff ? "Staff sign-in" : "Account"}
            </p>
            <h1 className="type-section mt-2 text-[var(--account-ink)]">{hubLabel}</h1>
            {isStaff ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--account-ink-muted)]">
                Signed in as {role}. Use your {hubLabel.toLowerCase()} for day-to-day work. This area is only for security settings.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AccountNav
              mode="mobile"
              links={navLinks}
              workspaceHref={workspaceHref}
              workspaceLabel={isStaff ? workspaceLabelForRole(role) : undefined}
            />
            {userId ? <NotificationBell recipientId={userId} href={workspaceHref ?? "/account"} /> : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <AccountNav
            links={navLinks}
            workspaceHref={workspaceHref}
            workspaceLabel={isStaff ? workspaceLabelForRole(role) : undefined}
          />
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
