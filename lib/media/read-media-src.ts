type JsonRecord = Record<string, unknown>;

export function readMediaSrc(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const src = (value as JsonRecord).src;
  return typeof src === "string" && src.trim() ? src.trim() : "";
}
