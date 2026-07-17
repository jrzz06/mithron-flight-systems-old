import { AdminShell } from "@/components/admin/admin-shell";
import { assertRouteAccessOrRedirect } from "@/services/auth";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const context = await assertRouteAccessOrRedirect("/operations");

  return (
    <AdminShell role={context.role!} userId={context.userId}>
      {children}
    </AdminShell>
  );
}
