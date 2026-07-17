export function isAssistantSurfacePath(pathname: string | null | undefined) {
  const path = pathname ?? "";
  if (!path) return false;
  if (path === "/") return true;
  if (path.startsWith("/category/")) return true;
  if (path.startsWith("/product/")) return true;
  return false;
}

