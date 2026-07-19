import { SiteFooter } from "@/components/layout/site-footer";
import { StoreNavWithAnchor } from "@/components/navigation/store-nav-with-anchor";
import { buildEnterpriseMenuConfigs } from "@/services/catalog-navigation";
import { getStorefrontShellBundle } from "@/services/storefront-shell-bundle";
import { footerContent } from "@/config/storefront-content";

const emptyShellCms = {
  navigation: [],
  footer: footerContent
};

async function loadShellBundle() {
  const bundleResult = await Promise.allSettled([getStorefrontShellBundle()]);
  const bundle = bundleResult[0].status === "fulfilled" ? bundleResult[0].value : null;

  if (bundleResult[0].status === "rejected") {
    const message = bundleResult[0].reason instanceof Error
      ? bundleResult[0].reason.message
      : String(bundleResult[0].reason);
    console.warn(`[storefront-shell] bundle load failed: ${message}`);
  }

  const enterpriseMenu = bundle?.enterpriseMenu ?? {
    products: [],
    errors: []
  };

  const cms = bundle?.cms ?? emptyShellCms;
  const enterpriseMenuConfigs = buildEnterpriseMenuConfigs(enterpriseMenu.products);

  return {
    navigationItems: cms.navigation,
    enterpriseMenuConfigs,
    footer: cms.footer
  };
}

export async function StorefrontShellHeaderChrome() {
  const shell = await loadShellBundle();
  return (
    <StoreNavWithAnchor
      navigationItems={shell.navigationItems}
      enterpriseMenuConfigs={shell.enterpriseMenuConfigs}
    />
  );
}

export async function StorefrontShellFooterChrome() {
  const shell = await loadShellBundle();
  return <SiteFooter content={shell.footer} />;
}
