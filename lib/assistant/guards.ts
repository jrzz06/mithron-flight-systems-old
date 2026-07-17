const MAX_USER_MESSAGE_CHARS = 1600;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_TOTAL_CHARS = 6000;

const BLOCK_PATTERNS: RegExp[] = [
  /ignore\s*(?:all|any|previous|above|prior)\s*instructions/i,
  /disregard (all|any|previous|above|prior)/i,
  /system prompt/i,
  /developer message/i,
  /hidden prompt/i,
  /reveal.*prompt/i,
  /you are now (?:a|an|the)/i,
  /act as (?:a|an|the) (?:admin|developer|root|system)/i,
  /api key|secret key|private key|bearer token|access token|refresh token/i,
  /env(ironment)? variable|\.env\b/i,
  /supabase schema|service role|service_role/i,
  /\bsql\b|union select|drop table|insert into|delete from|';?\s*--/i,
  /dump.*database|export.*database|database dump/i,
  /xss|html injection|javascript injection|js injection|onerror\s*=|document\.cookie/i,
  /nosql injection|ldap injection|command injection/i,
  /\.\.\/|\.\.\\|\/etc\/passwd|file inclusion|path traversal/i,
  /\b(lfi|rfi|xxe|sqli|csrf)\b/i,
  /;\s*(?:rm|curl|wget|bash|sh|powershell|cmd\.exe)/i,
  /bypass.*payment|payment link|mark.*paid|fake.*payment|refund without/i,
  /coupon|discount|promo code|\d+% off/i,
  /roleplay|jailbreak|\bdan\b|do anything now/i,
  /(change|lower|reduce|modify|update|set|match).*(price|pricing|cost)/i,
  /price (match|reduction|override|change)/i,
  /free order|waive (fee|charge)|zero cost order/i,
  /fake invoice|alter (gst|tax)|change stock|update stock|adjust inventory/i,
  /generate payment link|admin impersonat|pretend (?:to be|you are) admin/i,
  /\b(hack|exploit|vulnerability|pentest|phishing|malware|ransomware|keylogger|trojan|botnet|ddos)\b/i,
  /\b(rce|ssrf|xss|csrf|shell|reverse shell|credential dump|session hijack)\b/i,
  /brute force|password crack|steal (credentials|passwords)|credential stuffing/i,
  /zero[- ]day|0day|exfiltrat|data breach|steal data/i,
  /scrape (?:internal|admin|private)|admin panel|internal api|admin endpoint/i,
  /base64 decode|eval\s*\(|Function\s*\(|setTimeout\s*\(\s*['"]/i,
  /wire transfer scam|social engineering/i
];

const OUTPUT_PRICE_EDIT_PATTERNS: RegExp[] = [
  /i (?:have )?(?:set|changed|lowered|reduced|updated|applied).*(?:price|pricing|cost)/i,
  /your (?:new )?price is now/i,
  /i (?:can|will) (?:give|offer) you (?:a )?\d+% off/i,
  /payment link (?:is|has been) (?:sent|generated|created)/i,
  /order (?:is|has been) marked (?:as )?paid/i,
  /i (?:have )?(?:updated|changed) (?:the )?(?:stock|inventory|gst|tax)/i
];

const OUTPUT_UNSAFE_PATTERNS: RegExp[] = [
  /system prompt|developer message|hidden prompt/i,
  /(?:here is|this is) (?:the|your) (?:api key|secret key|private key|bearer token)/i,
  /GROQ_API_KEY|OPENROUTER_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE/i,
  /(?:run|execute|try) this (?:sql|query|command|script)/i,
  /(?:union select|drop table|<script|javascript:)/i,
  /(?:ignore|disregard) (?:all|any|previous) instructions/i,
  /(?:i can|you can) (?:hack|exploit|bypass|inject)/i,
  /admin panel (?:url|link|endpoint)|internal api endpoint/i
];

export type RefusalReason = "EMPTY" | "POLICY" | "PAYLOAD" | "ABUSE";

export function normalizeUserMessage(input: unknown) {
  const value = typeof input === "string" ? input : "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_USER_MESSAGE_CHARS);
}

/** Strip obfuscation tricks before policy checks. */
export function normalizeMessageForPolicyCheck(message: string) {
  return message
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function shouldRefuseMessage(message: string) {
  if (!message) return { refuse: true as const, reason: "EMPTY" as const };
  const normalized = normalizeMessageForPolicyCheck(message);
  if (BLOCK_PATTERNS.some((pattern) => pattern.test(message) || pattern.test(normalized))) {
    return { refuse: true as const, reason: "POLICY" as const };
  }
  return { refuse: false as const };
}

export function validateAssistantHistory(history: Array<{ role: "user" | "assistant"; content: string }>) {
  if (history.length > MAX_HISTORY_TURNS) {
    return { valid: false as const, reason: "PAYLOAD" as const };
  }

  let totalChars = 0;
  for (const turn of history) {
    totalChars += turn.content.length;
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) {
      return { valid: false as const, reason: "PAYLOAD" as const };
    }
  }

  return { valid: true as const };
}

export function shouldRefuseConversation(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  const payload = validateAssistantHistory(history);
  if (!payload.valid) {
    return { refuse: true as const, reason: payload.reason };
  }

  const current = shouldRefuseMessage(message);
  if (current.refuse) return current;

  for (const turn of history) {
    if (turn.role !== "user") continue;
    const refusal = shouldRefuseMessage(normalizeUserMessage(turn.content));
    if (refusal.refuse) return refusal;
  }

  return { refuse: false as const };
}

export function refusalText() {
  return "I can't help with that. I can answer questions about Mithron products, specifications, availability, warranty, shipping, and help you request a quote.";
}

export function enforcePlainTextOutput(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`+/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function enforceAssistantOutputPolicy(text: string) {
  const cleaned = enforcePlainTextOutput(text);
  if (
    OUTPUT_PRICE_EDIT_PATTERNS.some((pattern) => pattern.test(cleaned))
    || OUTPUT_UNSAFE_PATTERNS.some((pattern) => pattern.test(cleaned))
  ) {
    return refusalText();
  }
  return cleaned;
}

/** Guardrails for staff editor AI input (description enhancement). */
const EDITOR_BLOCK_PATTERNS: RegExp[] = [
  /ignore (all|any|previous|above|prior) instructions/i,
  /system prompt|developer message|hidden prompt/i,
  /api key|secret key|private key|bearer token|service role/i,
  /env(ironment)? variable|\.env\b/i,
  /union select|drop table|insert into|delete from|';?\s*--/i,
  /xss|html injection|javascript injection|onerror\s*=|document\.cookie/i,
  /\.\.\/|\.\.\\|\/etc\/passwd|path traversal/i,
  /\b(lfi|rfi|xxe|sqli|rce|ssrf|csrf)\b/i,
  /;\s*(?:rm|curl|wget|bash|sh|powershell)/i,
  /\b(hack|exploit|vulnerability|pentest|phishing|malware|ransomware)\b/i,
  /reverse shell|credential dump|session hijack|brute force/i,
  /eval\s*\(|Function\s*\(/i
];

export function shouldRefuseEditorAiInput(text: string) {
  if (!text.trim()) return { refuse: true as const, reason: "EMPTY" as const };
  const normalized = normalizeMessageForPolicyCheck(text);
  if (EDITOR_BLOCK_PATTERNS.some((pattern) => pattern.test(text) || pattern.test(normalized))) {
    return { refuse: true as const, reason: "POLICY" as const };
  }
  return { refuse: false as const };
}

export function clampToWordLimit(text: string, maxWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ").trim()}…`;
}

export { MAX_USER_MESSAGE_CHARS, MAX_HISTORY_TURNS };
