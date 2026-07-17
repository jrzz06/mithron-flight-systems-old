import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="surface-section-cool grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <h1 className="type-page text-5xl">Page not found</h1>
        <p className="type-body mt-4 max-w-md text-white/50">This page is not available. Return to the Mithron homepage.</p>
        <Button asChild className="mt-8"><Link href="/">Back to Mithron</Link></Button>
      </div>
    </div>
  );
}
