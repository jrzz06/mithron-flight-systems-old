import { redirect } from "next/navigation";
import {
  AccountCard,
  AccountPage as AccountPageShell,
  AccountSection
} from "@/components/account";
import { LogoutForm } from "@/components/auth/logout-form";
import { createClient } from "@/lib/server";
import { getCurrentAuthContext } from "@/services/auth";
import { ProfileForm } from "./profile-form";
import { ProfileSecurityPanel } from "./profile-security-panel";

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,phone")
    .maybeSingle();

  if (error) {
    console.warn("[mithron-account] Failed to load profile via RLS client.", error.message);
    return null;
  }

  return data ?? null;
}

export default async function AccountProfilePage() {
  const context = await getCurrentAuthContext();
  if (!context.userId) redirect("/login?next=/account/profile");

  const supabase = await createClient();
  const profile = await getProfile(supabase);
  const email = context.email ?? "";
  const displayName = profile?.display_name?.trim() || context.claimsDisplayName || "";

  return (
    <AccountPageShell>
      <AccountCard>
        <AccountSection
          title="Profile"
          description="Update your name and phone number for orders and enquiries."
        >
          <ProfileForm
            email={email}
            displayName={displayName}
            phone={String(profile?.phone ?? "")}
          />
        </AccountSection>
      </AccountCard>

      <div id="security">
        <ProfileSecurityPanel email={email || null} />
      </div>

      <AccountCard>
        <AccountSection title="Account" description="Sign out of your account on this device.">
          <LogoutForm
            buttonClassName="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--account-danger)] bg-transparent px-5 py-2 text-sm font-medium text-[var(--account-danger)] transition hover:bg-[color-mix(in_srgb,var(--account-danger)_8%,white)]"
          />
        </AccountSection>
      </AccountCard>
    </AccountPageShell>
  );
}
