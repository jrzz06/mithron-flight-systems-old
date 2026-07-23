import Link from "next/link";
import { redirect } from "next/navigation";
import { MithronBrandMark } from "@/components/brand/mithron-brand-mark";
import styles from "./login.module.css";
import { mapAuthPageNotice } from "@/lib/auth/client-errors";
import { resolveLoginPageRedirect } from "@/lib/auth/post-auth-redirect";
import { getAuthProviderAvailability } from "@/lib/auth/provider-registry";
import { buildLoginRedirectPath, unwrapAuthNextPath } from "@/lib/auth/redirects";
import { buildAuthAuditClientToken } from "@/lib/auth-audit-client";
import { createClient } from "@/lib/server";
import { LoginFormClient } from "./login-form-client";
import { LoginHeroBackground } from "./login-hero-background";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    mode?: string;
    invite?: string;
    auth_status?: string;
    admin_status?: string;
    access_status?: string;
    auth_error?: string;
    logout_status?: string;
    logout_reason?: string;
    logout_notice?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const initialMode = params.mode === "signup" ? "signup" as const : "signin" as const;
  // Sanitize once at the page boundary — never pass a nested `next` into the form or redirects.
  const nextPath = unwrapAuthNextPath(params.next, "");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (user) {
    const { data: role } = await supabase.rpc("current_enterprise_role");
    if (role) {
      redirect(resolveLoginPageRedirect({
        user,
        role,
        nextPath
      }));
    }

    await supabase.auth.signOut();
    redirect(buildLoginRedirectPath(nextPath || "/account", { auth_status: "role_required" }));
  }

  const auditToken = buildAuthAuditClientToken();
  const providers = getAuthProviderAvailability();
  const notice = mapAuthPageNotice(params);

  return (
    <main className={styles.loginRoot} data-testid="login-auth-gateway">
      <LoginHeroBackground />

      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <Link href="/" className={styles.cardLogoLink} aria-label="Go to Mithron home">
            <MithronBrandMark className={styles.cardLogo} priority />
          </Link>

          <p className={styles.cardTagline}>Drone is Mithron</p>

          <h1 className={styles.cardTitle} id="mithron-login-title">
            {initialMode === "signup" ? "Create your Mithron account" : "Log in to Mithron"}
          </h1>

          {notice ? (
            <p
              className={notice.tone === "error" ? styles.pageAlert : `${styles.pageAlert} ${styles.neutralAlert}`}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}

          <LoginFormClient
            nextPath={nextPath}
            initialMode={initialMode}
            inviteToken={params.invite ?? null}
            auditToken={auditToken}
            providers={providers}
          />
        </div>
      </div>
    </main>
  );
}
