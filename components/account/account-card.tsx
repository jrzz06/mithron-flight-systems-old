import { cn } from "@/lib/utils";

type AccountCardProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
};

export function AccountCard({ children, className, as: Tag = "div" }: AccountCardProps) {
  return (
    <div className="rounded-[22px] bg-[var(--account-border)] p-[1px]">
      <Tag
        className={cn(
          "rounded-[21px] bg-[var(--account-surface)] p-6 shadow-[var(--account-shadow-sm)] md:p-8",
          className
        )}
      >
        {children}
      </Tag>
    </div>
  );
}
