import { cn } from "@/lib/utils";

type AccountPageProps = {
  children: React.ReactNode;
  className?: string;
};

export function AccountPage({ children, className }: AccountPageProps) {
  return <div className={cn("grid gap-6", className)}>{children}</div>;
}
