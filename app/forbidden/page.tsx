import Link from "next/link";
import { redirect } from "next/navigation";
import { defaultPathForRole } from "@/lib/auth/access-control";
import { mapAuthPageNotice } from "@/lib/auth/client-errors";
import { Button } from "@/components/ui/button";
import { getCurrentAuthContext } from "@/services/auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForbiddenPage({ searchParams }: { searchParams?: SearchParams }) {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const notice = mapAuthPageNotice({
    admin_status: typeof params.admin_status === "string" ? params.admin_status : undefined,
    access_status: typeof params.access_status === "string" ? params.access_status : undefined
  });
  const attemptedPath = typeof params.next === "string" ? params.next : null;
  const workspaceHref = defaultPathForRole(context.role);

  return (
    <main className="surface-page flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-lg rounded-[28px] border border-[var(--surface-border)] bg-[var(--surface-card)] p-8 text-center">
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">403 Forbidden</p>
        <h1 className="type-section mt-3">Access denied</h1>
        <p className="mt-3 text-sm text-white/65">
          {notice?.message ?? "You do not have permission to open that page."}
        </p>
        {attemptedPath ? (
          <p className="mt-2 text-xs text-white/40">Requested path: {attemptedPath}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={workspaceHref}>Go to my workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
