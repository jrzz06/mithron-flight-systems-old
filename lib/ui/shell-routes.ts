export function isAuthEntryRoute(pathname: string | null) {
  if (!pathname) return false;

  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/invite/")
  );
}

export function isOperationalShellRoute(pathname: string | null) {
  if (!pathname) return false;

  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/warehouse" ||
    pathname.startsWith("/warehouse/") ||
    pathname === "/operations" ||
    pathname.startsWith("/operations/") ||
    pathname === "/supplier" ||
    pathname.startsWith("/supplier/")
  );
}

export function shouldSkipStorefrontChrome(pathname: string | null) {
  return isOperationalShellRoute(pathname) || isAuthEntryRoute(pathname);
}

export function shouldUseNativeScroll(pathname: string | null) {
  return shouldSkipStorefrontChrome(pathname);
}
