/**
 * Resolves Groq API keys for the storefront assistant.
 *
 * Supports:
 * - GROQ_API_KEY — primary key
 * - GROQ_API_KEYS — comma- or newline-separated fallback keys (deduped, primary first)
 */
export function resolveGroqApiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  };

  add(env.GROQ_API_KEY);

  const extras = env.GROQ_API_KEYS;
  if (extras) {
    for (const part of extras.split(/[,;\n]+/)) {
      add(part);
    }
  }

  return keys;
}

/** HTTP statuses where trying the next key may succeed (quota, auth, upstream). */
export function isGroqKeyRetryableStatus(status: number) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}
