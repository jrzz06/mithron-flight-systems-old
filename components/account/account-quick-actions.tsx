import Link from "next/link";
import { Button } from "@/components/ui/button";

type QuickAction = {
  label: string;
  href: string;
  variant?: "default" | "outline";
};

type AccountQuickActionsProps = {
  actions: QuickAction[];
};

export function AccountQuickActions({ actions }: AccountQuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <Button key={action.href} asChild variant={action.variant ?? "outline"}>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}
