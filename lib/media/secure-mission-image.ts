import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export function isSafeFilename(filename: string): boolean {
  if (!filename || filename.includes("\0")) return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

function isPathInsideBase(resolvedPath: string, baseDir: string): boolean {
  const normalizedBase = resolve(baseDir);
  const normalizedPath = resolve(resolvedPath);
  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}${sep}`);
}

export function resolveMissionImagePath(options: {
  filename: string;
  filenameByDest: Record<string, string>;
  publicSubdir: string;
  devSearchRoots: () => string[];
  publicBaseParts?: string[];
}): string | undefined {
  const { filename, filenameByDest, publicSubdir, devSearchRoots, publicBaseParts } = options;

  if (!isSafeFilename(filename)) return undefined;
  if (!(filename in filenameByDest)) return undefined;

  const publicBase = resolve(
    join(process.cwd(), ...(publicBaseParts ?? ["public", "media", "mithron", "mission", publicSubdir]))
  );
  const localPublicPath = resolve(join(publicBase, filename));
  if (!isPathInsideBase(localPublicPath, publicBase)) return undefined;
  if (existsSync(localPublicPath)) return localPublicPath;

  if (process.env.NODE_ENV === "production") return undefined;

  const sourceName = filenameByDest[filename];
  for (const root of devSearchRoots()) {
    const resolvedRoot = resolve(root);
    const candidate = resolve(join(resolvedRoot, sourceName));
    if (!isPathInsideBase(candidate, resolvedRoot)) continue;
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}
