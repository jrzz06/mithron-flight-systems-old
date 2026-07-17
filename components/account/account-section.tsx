import { cn } from "@/lib/utils";

type AccountSectionProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
};

export function AccountSection({
  title,
  description,
  action,
  children,
  className,
  headingLevel: Heading = "h3"
}: AccountSectionProps) {
  return (
    <section className={cn("grid gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className="text-base font-semibold text-[var(--account-ink)]">{title}</Heading>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-[var(--account-ink-muted)]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
