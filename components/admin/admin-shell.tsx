import { AdminFrame } from "@/components/admin/admin-frame";
import type { CmsRole } from "@/lib/auth/access-control";

export function AdminShell({
  role,
  userId,
  children
}: {
  role: CmsRole;
  userId: string | null;
  children: React.ReactNode;
}) {
  return (
    <AdminFrame role={role} userId={userId}>
      {children}
    </AdminFrame>
  );
}
