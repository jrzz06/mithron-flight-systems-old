import { redirect } from "next/navigation";
import {
  defaultPathForRole,
  isControlPanelRole,
  workspaceLabelForRole
} from "@/lib/auth/access-control";
import { isAdminMfaRequired } from "@/lib/auth/admin-mfa";
import { getCurrentAuthContext } from "@/services/auth";
import { SecurityPanel } from "./security-panel";

type AccountSecurityPageProps = {
  searchParams: Promise<{ mfa_required?: string }>;
};

export default async function AccountSecurityPage({ searchParams }: AccountSecurityPageProps) {
  const params = await searchParams;
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account/security");

  const role = context.role ?? "user";
  const isStaff = isControlPanelRole(role);

  if (!isStaff) {
    redirect("/account/profile#security");
  }

  const workspaceHref = defaultPathForRole(role);
  const workspaceLabel = workspaceLabelForRole(role);
  const mfaRequiredNotice = params.mfa_required === "1" && !isAdminMfaRequired()
    ? "Multi-factor authentication is not enabled for this workspace yet."
    : null;

  return (
    <SecurityPanel
      workspaceHref={workspaceHref}
      workspaceLabel={workspaceLabel}
      isStaff={isStaff}
      email={context.email}
      mfaRequiredNotice={mfaRequiredNotice}
    />
  );
}
