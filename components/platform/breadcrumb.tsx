import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
            {index > 0 ? (
              <span className="text-[var(--platform-text-muted)]" aria-hidden="true">/</span>
            ) : null}
            {item.href && !isLast ? (
              <Link href={item.href} className="font-medium text-[var(--platform-text-secondary)] hover:text-[var(--platform-accent)]">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-[var(--platform-text-primary)]" : "text-[var(--platform-text-secondary)]"}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
