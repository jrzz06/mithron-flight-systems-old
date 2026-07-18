import { redirect } from "next/navigation";
import { canAccessCmsDraftPreview } from "@/lib/cms/cms-preview-mode";
import { HomePageContent } from "@/sections/home/home-page-content";

export const dynamic = "force-dynamic";

export default async function HomeDraftPreviewPage() {
  if (!(await canAccessCmsDraftPreview())) {
    redirect("/login?next=/preview/home");
  }

  return (
    <>
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        Draft preview — not visible on the live storefront.
      </div>
      <HomePageContent cmsDraftPreview />
    </>
  );
}
