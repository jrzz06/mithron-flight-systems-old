export type FeaturedSpec = {
  label: string;
  value: string;
};

export type FeaturedMenuCard = {
  key: string;
  name: string;
  eyebrow: string;
  body: string;
  href: string;
  image: string;
  imageAlt: string;
  price?: string;
  specs: FeaturedSpec[];
  ctaLabel: string;
};

export type EnterpriseMenuOption = {
  label: string;
  href: string;
  featureKey?: string;
  thumbnail?: string;
};

export type MegaMenuConfig = {
  type: "mega";
  key: string;
  label: string;
  href: string;
  eyebrow: string;
  columnOneTitle: string;
  columnOne: EnterpriseMenuOption[];
  defaultFeatureKey: string;
  featured: FeaturedMenuCard[];
  productCount: number;
};

export type CompactMenuConfig = {
  type: "compact";
  key: string;
  label: string;
  href: string;
  eyebrow: string;
  items: EnterpriseMenuOption[];
};

export type FranchiseMenuConfig = {
  type: "franchise";
  key: string;
  label: string;
  href: string;
  eyebrow: string;
  headline: string;
  body: string;
  items: EnterpriseMenuOption[];
  card: FeaturedMenuCard;
};

export type EnterpriseMenuConfig = MegaMenuConfig | CompactMenuConfig | FranchiseMenuConfig;
