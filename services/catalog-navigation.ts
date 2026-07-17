import type { Product } from "@/config/types";
import {
  catalogCategoryDefinitions,
  filterProductsForCategorySlug,
  resolveDroneCareStorefrontHref,
  type CatalogCategoryDefinition,
  type CatalogCategorySlug
} from "@/lib/catalog-categories";
import type {
  CompactMenuConfig,
  EnterpriseMenuConfig,
  EnterpriseMenuOption,
  FeaturedMenuCard,
  FranchiseMenuConfig,
  MegaMenuConfig
} from "@/lib/nav-menu-types";
import { formatFromINR } from "@/lib/utils";

const MENU_COLUMN_LIMIT = 5;

function productSpecs(product: Product) {
  const entries = Object.entries(product.specs ?? {}).slice(0, 3);
  if (entries.length) {
    return entries.map(([label, value]) => ({ label, value }));
  }

  return [
    { label: "Category", value: product.category },
    { label: "Price", value: product.price ? formatFromINR(product.price) : "On request" }
  ];
}

function buildFeaturedMenuCard(product: Product, key = product.slug): FeaturedMenuCard {
  return {
    key,
    name: product.name,
    eyebrow: product.badge ?? product.category,
    body: product.tagline,
    price: product.price ? formatFromINR(product.price) : undefined,
    href: `/product/${product.slug}`,
    image: product.image.src,
    imageAlt: product.image.alt,
    specs: productSpecs(product),
    ctaLabel: "View Product →"
  };
}

function pickFeaturedProducts(products: Product[], limit = 5) {
  const featured = products.filter((product) => Boolean(product.badge));
  if (featured.length) return featured.slice(0, limit);
  if (products.length) return [products[0], ...products.slice(1, limit)];
  return [];
}

function pickPrimaryFeaturedProduct(products: Product[]) {
  const featured = products.find((product) => Boolean(product.badge));
  if (featured) return featured;
  if (products[0]) return products[0];
  return products[products.length - 1];
}

function productMenuOptions(products: Product[]): EnterpriseMenuOption[] {
  return products.map((product) => ({
    label: product.name,
    href: `/product/${product.slug}`,
    featureKey: product.slug,
    thumbnail: product.image.src
  }));
}

function splitMenuColumns(products: Product[], categoryHref: string) {
  const options = productMenuOptions(products);
  const columnOne = options.slice(0, MENU_COLUMN_LIMIT);
  const columnTwo = options.slice(MENU_COLUMN_LIMIT, MENU_COLUMN_LIMIT * 2);

  if (!columnOne.length) {
    return {
      columnOne: [{ label: "View all products", href: categoryHref, featureKey: "view-all" }],
      columnTwo: []
    };
  }

  if (!columnTwo.length) {
    return {
      columnOne,
      columnTwo: [{ label: "View all products", href: categoryHref, featureKey: "view-all" }]
    };
  }

  return { columnOne, columnTwo };
}

function buildMegaMenu(definition: CatalogCategoryDefinition, products: Product[]): MegaMenuConfig {
  const featuredProducts = pickFeaturedProducts(products);
  const featured = featuredProducts.map((product) => buildFeaturedMenuCard(product));
  const { columnOne, columnTwo } = splitMenuColumns(products, definition.href);
  const defaultFeatureKey = featured[0]?.key ?? "view-all";

  if (!featured.length) {
    featured.push({
      key: "view-all",
      name: definition.label,
      eyebrow: "Mithron catalog",
      body: `Browse published ${definition.label.toLowerCase()} from the live Mithron catalog.`,
      href: resolveDroneCareStorefrontHref(definition.href),
      image: products[0]?.image.src ?? "/media/mithron/interests/components.webp",
      imageAlt: `${definition.label} catalog`,
      specs: [{ label: "Products", value: "0 published" }],
      ctaLabel: "View Category"
    });
  }

  return {
    type: "mega",
    key: definition.menuKey,
    label: definition.label,
    href: resolveDroneCareStorefrontHref(definition.href),
    eyebrow: "Mithron catalog",
    columnOneTitle: "Featured Products",
    columnOne,
    columnTwoTitle: "Popular Products",
    columnTwo,
    defaultFeatureKey,
    featured
  };
}

function buildCompactMenu(definition: CatalogCategoryDefinition, products: Product[]): CompactMenuConfig {
  const items = productMenuOptions(products.slice(0, 6));
  if (!items.length) {
    items.push({ label: "View all accessories", href: definition.href });
  }

  return {
    type: "compact",
    key: definition.menuKey,
    label: definition.label,
    href: resolveDroneCareStorefrontHref(definition.href),
    eyebrow: "Mithron catalog",
    items
  };
}

function buildFranchiseMenu(definition: CatalogCategoryDefinition, products: Product[]): FranchiseMenuConfig {
  const featuredProduct = pickPrimaryFeaturedProduct(products);
  const productItems = productMenuOptions(products.slice(0, 4));

  return {
    type: "franchise",
    key: definition.menuKey,
    label: definition.label,
    href: resolveDroneCareStorefrontHref(definition.href),
    eyebrow: "Partner ecosystem",
    headline: "Build a local Mithron service and deployment footprint.",
    body: "Partner pathways connect product discovery, Drone Care support, training, exports, and field operations without turning the nav into a sales form.",
    items: [
      ...productItems,
      { label: "View all global products", href: definition.href },
      { label: "Contact Team", href: "/contact" }
    ],
    card: featuredProduct
      ? buildFeaturedMenuCard(featuredProduct, "franchise-card")
      : {
          key: "franchise-card",
          name: definition.label,
          eyebrow: "Global catalog",
          body: "Published global products from the live Mithron catalog.",
          href: resolveDroneCareStorefrontHref(definition.href),
          image: "/media/mithron/interests/components.webp",
          imageAlt: "Mithron global products catalog",
          specs: [{ label: "Systems", value: "0 published" }],
          ctaLabel: "View Category"
        }
  };
}

export function buildEnterpriseMenuConfigs(products: Product[]): EnterpriseMenuConfig[] {
  return catalogCategoryDefinitions.map((definition) => {
    const categoryProducts = filterProductsForCategorySlug(products, definition.slug as CatalogCategorySlug);

    return buildMegaMenu(definition, categoryProducts);
  });
}
