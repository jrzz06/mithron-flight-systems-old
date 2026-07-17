type EnvSource = Record<string, string | undefined>;

/** Internal operator seed tooling — never exposed on the public login page. */
export function isDemoSeedingEnabled(env: EnvSource = process.env) {
  return env.ALLOW_DEMO_SEED === "true";
}
