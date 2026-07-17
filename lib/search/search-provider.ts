export type SearchProviderId = "postgres" | "typesense";

export function getActiveSearchProvider(
  env: Record<string, string | undefined> = process.env
): SearchProviderId {
  const provider = env.MITHRON_SEARCH_PROVIDER?.trim().toLowerCase();
  if (provider === "typesense") return "typesense";
  return "postgres";
}

export function isTypesenseSearchEnabled(env: Record<string, string | undefined> = process.env) {
  return getActiveSearchProvider(env) === "typesense"
    && Boolean(env.TYPESENSE_HOST?.trim() && env.TYPESENSE_API_KEY?.trim());
}

export type TypesenseConfig = {
  host: string;
  apiKey: string;
  collection: string;
};

export function getTypesenseConfig(
  env: Record<string, string | undefined> = process.env
): TypesenseConfig | null {
  if (!isTypesenseSearchEnabled(env)) return null;
  return {
    host: env.TYPESENSE_HOST!.trim(),
    apiKey: env.TYPESENSE_API_KEY!.trim(),
    collection: env.TYPESENSE_COLLECTION?.trim() || "mithron_products"
  };
}
