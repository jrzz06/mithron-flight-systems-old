"use client";

import { Suspense } from "react";
import { LoginForm } from "./login-form";
import type { AuthFormMode } from "./login-form";
import type { AuthProviderAvailability } from "@/lib/auth/provider-registry";

function LoginFormInner({
  nextPath,
  initialMode,
  inviteToken,
  auditToken,
  providers
}: {
  nextPath: string;
  initialMode: AuthFormMode;
  inviteToken?: string | null;
  auditToken?: string | null;
  providers: AuthProviderAvailability;
}) {
  return (
    <LoginForm
      nextPath={nextPath}
      initialMode={initialMode}
      inviteToken={inviteToken}
      auditToken={auditToken}
      providers={providers}
    />
  );
}

export function LoginFormClient({
  nextPath,
  initialMode = "signin",
  inviteToken = null,
  auditToken = null,
  providers
}: {
  nextPath: string;
  initialMode?: AuthFormMode;
  inviteToken?: string | null;
  auditToken?: string | null;
  providers: AuthProviderAvailability;
}) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner
        nextPath={nextPath}
        initialMode={initialMode}
        inviteToken={inviteToken}
        auditToken={auditToken}
        providers={providers}
      />
    </Suspense>
  );
}
