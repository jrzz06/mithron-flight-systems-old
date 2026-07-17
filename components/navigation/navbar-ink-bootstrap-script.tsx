import { getNavbarInkBootstrapInlineScript } from "@/lib/navbar-ink-document";

export function NavbarInkBootstrapScript() {
  return (
    <script
      id="navbar-ink-bootstrap"
      dangerouslySetInnerHTML={{ __html: getNavbarInkBootstrapInlineScript() }}
    />
  );
}
