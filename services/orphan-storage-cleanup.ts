import { createClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { parseStoragePublicUrl } from "@/lib/media/backfill-primary-media";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const BUCKET = "mithron-products";
const DEFAULT_MIN_AGE_DAYS = 7;
const DEFAULT_MAX_PER_RUN = 100;
const PAGE = 500;

export type OrphanStorageCandidate = {
  path: string;
  sizeBytes: number | null;
  createdAt: string | null;
};

export type OrphanStorageCleanupResult = {
  dryRun: boolean;
  bucket: string;
  referencedPaths: number;
  scannedObjects: number;
  candidates: OrphanStorageCandidate[];
  deleted: string[];
  skipped: number;
  minAgeDays: number;
  maxPerRun: number;
};

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolveOrphanStorageApply(env: EnvSource = process.env) {
  const raw = String(env.ORPHAN_STORAGE_APPLY ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function resolveOrphanStorageMinAgeDays(env: EnvSource = process.env) {
  return parseBoundedInt(env.ORPHAN_STORAGE_MIN_AGE_DAYS, DEFAULT_MIN_AGE_DAYS, 1, 365);
}

export function resolveOrphanStorageMaxPerRun(env: EnvSource = process.env) {
  return parseBoundedInt(env.ORPHAN_STORAGE_MAX_DELETE_PER_RUN, DEFAULT_MAX_PER_RUN, 1, 500);
}

function collectStoragePathsFromUnknown(value: unknown, output: Set<string>) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = parseStoragePublicUrl(trimmed);
    if (parsed?.bucket === BUCKET && parsed.storagePath) {
      output.add(parsed.storagePath);
      return;
    }
    // Relative storage path already in DB metadata.
    if (!trimmed.includes("://") && trimmed.includes("/") && /\.(webp|avif|png|jpe?g|gif)$/i.test(trimmed)) {
      output.add(trimmed.replace(/^\/+/, ""));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStoragePathsFromUnknown(item, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if ((key === "storage_path" || key === "storagePath") && typeof item === "string" && item.trim()) {
      output.add(item.trim());
    } else {
      collectStoragePathsFromUnknown(item, output);
    }
  }
}

async function fetchJsonRows(
  config: { url: string; serviceRoleKey: string },
  table: string,
  select: string
) {
  const rows: JsonRecord[] = [];
  let from = 0;
  while (true) {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${PAGE}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Prefer: "count=exact"
        },
        cache: "no-store"
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to read ${table} for orphan GC: ${response.status}`);
    }
    const page = (await response.json()) as JsonRecord[];
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function buildReferencedStoragePaths(env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const referenced = new Set<string>();

  const mediaRows = await fetchJsonRows(
    config,
    "media_assets",
    "bucket,storage_path,public_url,variants,responsive_variants,upload_metadata"
  );
  for (const row of mediaRows) {
    if (String(row.bucket ?? "") === BUCKET || !row.bucket) {
      collectStoragePathsFromUnknown(row, referenced);
    }
  }

  const productRows = await fetchJsonRows(config, "mithron_products", "image,hero,gallery,og_image");
  for (const row of productRows) collectStoragePathsFromUnknown(row, referenced);

  const cmsTables: Array<{ table: string; select: string }> = [
    { table: "hero_banners", select: "image,poster,video" },
    { table: "category_metadata", select: "hero_image,showcase_image" },
    { table: "trust_cards", select: "image_src" },
    { table: "promotional_campaigns", select: "media_asset_id" },
    { table: "cms_sections", select: "payload" },
    { table: "press_coverage", select: "cover_image" }
  ];

  for (const entry of cmsTables) {
    try {
      const rows = await fetchJsonRows(config, entry.table, entry.select);
      for (const row of rows) {
        collectStoragePathsFromUnknown(row, referenced);
        const mediaAssetId = typeof row.media_asset_id === "string" ? row.media_asset_id.trim() : "";
        if (!mediaAssetId) continue;
        const targeted = await fetchWithTimeout(
          `${config.url}/rest/v1/media_assets?select=bucket,storage_path,public_url,variants,responsive_variants&id=eq.${encodeURIComponent(mediaAssetId)}&limit=1`,
          {
            headers: {
              apikey: config.serviceRoleKey,
              Authorization: `Bearer ${config.serviceRoleKey}`
            },
            cache: "no-store"
          }
        );
        if (!targeted.ok) continue;
        const linked = (await targeted.json()) as JsonRecord[];
        for (const asset of linked) collectStoragePathsFromUnknown(asset, referenced);
      }
    } catch (error) {
      console.warn(
        `[orphan-storage] skipped reference table ${entry.table}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Variant companions of referenced masters should also be protected when only the master is stored.
  for (const path of [...referenced]) {
    const base = path.replace(/\.(thumbnail|medium|large|xlarge|ultra)\.(webp|avif)$/i, "");
    if (base !== path) referenced.add(base);
  }

  return referenced;
}

type ListedObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number | string | null } | null;
};

async function listAllObjects(
  supabase: ReturnType<typeof createClient>,
  prefix = ""
): Promise<Array<{ path: string; sizeBytes: number | null; createdAt: string | null }>> {
  const out: Array<{ path: string; sizeBytes: number | null; createdAt: string | null }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error(`Failed to list ${BUCKET}/${prefix}: ${error.message}`);
    const entries = (data ?? []) as ListedObject[];
    if (!entries.length) break;

    for (const entry of entries) {
      const name = String(entry.name ?? "").trim();
      if (!name) continue;
      const fullPath = prefix ? `${prefix}/${name}` : name;
      const isFolder = !entry.id && !entry.metadata;
      if (isFolder) {
        const nested = await listAllObjects(supabase, fullPath);
        out.push(...nested);
        continue;
      }
      const sizeRaw = entry.metadata?.size;
      const sizeBytes =
        typeof sizeRaw === "number"
          ? sizeRaw
          : typeof sizeRaw === "string" && Number.isFinite(Number(sizeRaw))
            ? Number(sizeRaw)
            : null;
      out.push({
        path: fullPath,
        sizeBytes,
        createdAt: entry.created_at ?? entry.updated_at ?? null
      });
    }

    if (entries.length < 100) break;
    offset += 100;
  }
  return out;
}

function isOlderThan(createdAt: string | null, minAgeDays: number, nowMs: number) {
  if (!createdAt) return true;
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= nowMs - minAgeDays * 86_400_000;
}

export async function runOrphanStorageCleanup(
  env: EnvSource = process.env,
  options: { dryRun?: boolean; apply?: boolean } = {}
): Promise<OrphanStorageCleanupResult> {
  const applyEnabled = options.apply ?? resolveOrphanStorageApply(env);
  const dryRun = options.dryRun ?? !applyEnabled;
  const minAgeDays = resolveOrphanStorageMinAgeDays(env);
  const maxPerRun = resolveOrphanStorageMaxPerRun(env);
  const config = assertSupabaseAdminConfig(env);
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const referenced = await buildReferencedStoragePaths(env);
  const objects = await listAllObjects(supabase);
  const nowMs = Date.now();
  const candidates: OrphanStorageCandidate[] = [];

  for (const object of objects) {
    if (referenced.has(object.path)) continue;
    if (!isOlderThan(object.createdAt, minAgeDays, nowMs)) continue;
    candidates.push({
      path: object.path,
      sizeBytes: object.sizeBytes,
      createdAt: object.createdAt
    });
    if (candidates.length >= maxPerRun) break;
  }

  console.info(
    "[orphan-storage]",
    JSON.stringify({
      dryRun,
      bucket: BUCKET,
      referencedPaths: referenced.size,
      scannedObjects: objects.length,
      candidateCount: candidates.length,
      candidates: candidates.map((item) => ({
        path: item.path,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt
      }))
    })
  );

  const deleted: string[] = [];
  if (!dryRun && candidates.length) {
    for (let i = 0; i < candidates.length; i += 80) {
      const chunk = candidates.slice(i, i + 80).map((item) => item.path);
      const { error } = await supabase.storage.from(BUCKET).remove(chunk);
      if (error) {
        throw new Error(`Failed to delete orphan storage objects: ${error.message}`);
      }
      deleted.push(...chunk);
    }
  }

  return {
    dryRun,
    bucket: BUCKET,
    referencedPaths: referenced.size,
    scannedObjects: objects.length,
    candidates,
    deleted,
    skipped: Math.max(0, objects.length - referenced.size - candidates.length),
    minAgeDays,
    maxPerRun
  };
}
