type EnvSource = Record<string, string | undefined>;

function isNextProductionBuild(env: EnvSource) {
  return env.NEXT_PHASE === "phase-production-build";
}

/** Explicit flag or production runtime — never during `next build` static collection. */
export function isCmsStrictMode(env: EnvSource = process.env) {
  if (env.MITHRON_CMS_STRICT === "false") return false;
  if (env.MITHRON_CMS_STRICT === "true") return true;
  if (env.NODE_ENV === "production" && !isNextProductionBuild(env)) return true;
  return false;
}
