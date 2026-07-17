export function getControlPlaneThemeAttrs() {
  if (typeof document === "undefined") return { theme: "dark", scope: undefined };
  const root = document.querySelector("[data-control-plane]");
  return {
    theme: root?.getAttribute("data-control-plane-theme") ?? "dark",
    scope: root?.getAttribute("data-control-plane-scope") ?? undefined
  };
}
