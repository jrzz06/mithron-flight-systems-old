import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
};

const paddingClass = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5"
};

export function Surface({ children, className = "", padding = "md" }: SurfaceProps) {
  return (
    <section
      className={`mithron-elevated-card rounded-[var(--platform-radius)] bg-[var(--platform-surface)] ${paddingClass[padding]} ${className}`}
    >
      {children}
    </section>
  );
}

type CardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, description, actions, children, className = "" }: CardProps) {
  return (
    <Surface className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="platform-type-card-title">{title}</h3>
          {description ? <p className="platform-type-caption mt-1.5 max-w-2xl">{description}</p> : null}
        </div>
        {actions ? <div className="platform-action-bar w-auto shrink-0">{actions}</div> : null}
      </div>
      {children}
    </Surface>
  );
}
