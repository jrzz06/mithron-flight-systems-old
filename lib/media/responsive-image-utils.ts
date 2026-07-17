export function pickResponsiveWidth(width?: number | string, fill?: boolean) {
  if (fill) return undefined;
  const numeric = typeof width === "number" ? width : Number(width);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(numeric, 1280);
  return 768;
}
