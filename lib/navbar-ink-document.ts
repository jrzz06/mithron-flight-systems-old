import {
  categoryPathNavbarInk,
  homepageSlideNavbarInk,
  HOMEPAGE_BOOTSTRAP_SLIDE_ID
} from "@/config/navbar-ink-registry";
import { FLUSH_HERO_LIGHT_NAV_ROUTES, resolvePathNavbarTone } from "@/lib/navbar-ink-resolver";
import { normalizeStorefrontPath, type NavbarInkTone } from "@/config/navbar-ink-registry";
import { NAVBAR_INK_STYLE_VARS } from "@/lib/navbar-ink-vars";

export function applyNavbarInkToDocument(tone: NavbarInkTone, options?: { markHydrated?: boolean }) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-nav-ink", tone);

  const vars = NAVBAR_INK_STYLE_VARS[tone];
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }

  if (options?.markHydrated) {
    root.setAttribute("data-nav-ink-hydrated", "");
  }
}

function serializeNavbarInkVars(tone: NavbarInkTone) {
  const vars = NAVBAR_INK_STYLE_VARS[tone];
  return Object.entries(vars)
    .map(([name, value]) => `e.style.setProperty(${JSON.stringify(name)},${JSON.stringify(value)})`)
    .join(";");
}

export function getNavbarInkBootstrapInlineScript() {
  const categoryInkMap = JSON.stringify(categoryPathNavbarInk);
  const homepageBootstrapInk = homepageSlideNavbarInk[HOMEPAGE_BOOTSTRAP_SLIDE_ID];
  const heroRoutes = JSON.stringify([...FLUSH_HERO_LIGHT_NAV_ROUTES]);
  const applyLight = serializeNavbarInkVars("light");
  const applyDark = serializeNavbarInkVars("dark");

  return `(function(){function n(p){if(!p)return"/";return p.length>1&&p.endsWith("/")?p.slice(0,-1):p}function r(p){var t=n(p);if(t==="/")return ${JSON.stringify(homepageBootstrapInk)};if(t==="/login")return"light";var c=${categoryInkMap};if(c[t])return c[t];if(t.indexOf("/category/")===0)return"light";var h=${heroRoutes};for(var i=0;i<h.length;i++){if(t===h[i])return"light"}return"dark"}function a(t){var e=document.documentElement;e.setAttribute("data-nav-ink",t);if(t==="light"){${applyLight}}else{${applyDark}}}a(r(location.pathname))})();`;
}

export function resolveBootstrapNavbarTone(pathname: string | null): NavbarInkTone {
  return resolvePathNavbarTone(normalizeStorefrontPath(pathname));
}
