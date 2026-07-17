type EnvSource = Record<string, string | undefined>;

export function isInternetDeployedEnvironment(env: EnvSource = process.env) {
  if (env.VERCEL === "1") return true;
  if (env.NODE_ENV === "production") return true;
  return false;
}

export function isLocalStubPaymentAllowed(env: EnvSource = process.env) {
  if (isInternetDeployedEnvironment(env)) return false;
  return (env.PAYMENT_PROVIDER ?? "stub").toLowerCase() === "stub";
}
