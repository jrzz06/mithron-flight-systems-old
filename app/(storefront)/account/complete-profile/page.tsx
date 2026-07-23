import { redirect } from "next/navigation";
import { GUEST_AUTH_HOME } from "@/lib/auth/guest-auth";
import { isProfileIdentityComplete } from "@/lib/auth/profile-identity";
import { validateCustomerName } from "@/lib/api/customer-contact";
import { buildLoginRedirectPath, unwrapAuthNextPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/server";
import { getCurrentAuthContext } from "@/services/auth";
import { CompleteProfileForm } from "./complete-profile-form";
import styles from "./complete-profile.module.css";

type CompleteProfilePageProps = {
  searchParams: Promise<{ next?: string }>;
};

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,full_name,phone")
    .maybeSingle();

  if (error) {
    console.warn("[mithron-account] Failed to load profile for completion gate.", error.message);
    return null;
  }

  return data;
}

export default async function CompleteProfilePage({ searchParams }: CompleteProfilePageProps) {
  const params = await searchParams;
  const nextPath = unwrapAuthNextPath(params.next, GUEST_AUTH_HOME);

  const context = await getCurrentAuthContext();
  if (!context.userId) {
    // Preserve the final destination only — never wrap complete-profile as `next`.
    redirect(buildLoginRedirectPath(nextPath));
  }

  const supabase = await createClient();
  const profile = await getProfile(supabase);
  if (profile && isProfileIdentityComplete(profile)) {
    redirect(nextPath);
  }

  const email = context.email ?? "";
  const displayName = profile?.full_name?.trim()
    || profile?.display_name?.trim()
    || context.claimsDisplayName
    || "";
  const phone = profile?.phone?.trim() || context.claimsPhone || "";
  const nameAlreadyValid = validateCustomerName(displayName).ok;

  return (
    <div className={styles.shell} data-testid="complete-profile-page">
      <CompleteProfileForm
        email={email}
        displayName={displayName}
        phone={phone}
        nextPath={nextPath}
        nameAlreadyValid={nameAlreadyValid}
      />
    </div>
  );
}
