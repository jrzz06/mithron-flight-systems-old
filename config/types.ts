export type MediaAsset = {
  id?: string;
  src: string;
  alt: string;
  kind?: "image" | "video" | "model";
  width?: number;
  height?: number;
  poster?: string;
  local?: boolean;
  priority?: boolean;
  responsive?: ResponsiveMediaAsset;
  mobileOverride?: {
    src: string;
    alt: string;
  };
};

export type MithronAssetBucket =
  | "mithron-hero"
  | "mithron-products"
  | "mithron-interests"
  | "mithron-story";

export type MithronAssetFormat = "avif" | "webp" | "png";

export type MithronAssetStatus = "generated" | "fallback" | "missing";

export type ResponsiveMediaVariant = {
  width: number;
  height: number;
  format: MithronAssetFormat;
  src: string;
  storagePath: string;
  optimizedSizeKb?: number;
};

export type ResponsiveMediaAsset = {
  assetId: string;
  bucket: MithronAssetBucket;
  assetRole: CinematicMediaAsset["role"];
  category: string;
  productSlug?: string;
  generatedPromptId: string;
  status: MithronAssetStatus;
  fallbackSrc: string;
  fallbackAlt: string;
  width: number;
  height: number;
  blurhash?: string;
  blurDataUrl?: string;
  dominantColor: string;
  variants: Partial<Record<MithronAssetFormat, ResponsiveMediaVariant[]>>;
};

export type CinematicMediaAsset = MediaAsset & {
  id: string;
  src: string;
  kind: "image" | "video";
  local: true;
  role: "hero" | "product" | "story" | "thumbnail" | "poster";
};

export type MotionPreset = {
  id: string;
  duration: number;
  ease: readonly number[];
  stagger?: number;
  blur?: number;
};

export type ProductHotspot = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
};

export type ProductVariant = {
  id: string;
  name: string;
  tone: string;
};

export type Bundle = {
  id: string;
  name: string;
  price: number;
  compareAt?: number;
  badge?: string;
  description: string;
  includes: string[];
};

export type StorySection = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  stat?: string;
  media: MediaAsset;
  align?: "left" | "center" | "right";
};

export type Product = {
  slug: string;
  productUrl: string;
  workflowStatus?: "draft" | "pending_review" | "published" | "rejected" | "archived";
  publishedAt?: string;
  archivedAt?: string;
  isVisible?: boolean;
  name: string;
  tagline: string;
  seoTitle?: string;
  seoDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: MediaAsset;
  price: number;
  compareAt?: number;
  badge?: string;
  badgeStyle?: import("@/lib/product-badge").ProductBadgeStyle;
  description?: string;
  sourceDescription?: string;
  onSale?: boolean;
  discountType?: "percent" | "amount";
  discountValue?: number;
  costOfGoods?: number;
  showPricePerUnit?: boolean;
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  category: string;
  interests: string[];
  image: MediaAsset;
  hero: MediaAsset;
  gallery: MediaAsset[];
  hotspots?: ProductHotspot[];
  variants: ProductVariant[];
  bundles: Bundle[];
  story: StorySection[];
  specs: Record<string, string>;
  anchors: string[];
  sourceCatalogId?: string;
};

export type Interest = {
  slug: string;
  label: string;
  image: MediaAsset;
  headline: string;
};

export type HeroComposition = {
  mode?: "product-stage" | "full-bleed";
  textTone?: "light" | "dark" | "split";
  mediaPosition?: string;
  mobileMediaPosition?: string;
  productPosition?: string;
  mobileProductPosition?: string;
  overlay?: "soft" | "balanced" | "strong";
  productDominance?: "standard" | "flagship";
};

export type HeroSlide = {
  id: string;
  productSlug: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: MediaAsset;
  poster: MediaAsset;
  video?: MediaAsset;
  motionPreset?: string;
  theme: "dark" | "light";
  composition?: HeroComposition;
  /** Optional CSS color override for the headline text (e.g. "#ffffff" or "rgba(255,255,255,.9)"). */
  titleColor?: string | null;
  /** Optional CSS color override for the subtitle/body text. */
  subtitleColor?: string | null;
};

export type NavigationNode = {
  label: string;
  href: string;
  children?: NavigationNode[];
};

export type PersistedCartItem = {
  productSlug: string;
  bundleId: string;
  quantity: number;
  variantId?: string;
  productName?: string;
  bundleName?: string;
  image?: string;
};

export type CartItem = PersistedCartItem & {
  productName: string;
  bundleName: string;
  unitPrice: number;
  compareAt?: number | null;
  image: string;
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  category?: string;
  sku?: string;
  availabilityLabel?: string;
};

export type CheckoutStep = "cart" | "details" | "shipping" | "payment" | "review" | "confirmation";

export type CheckoutDraft = {
  step: CheckoutStep;
  promoCode: string;
  email: string;
  fullName?: string;
  phone?: string;
  region: string;
  shippingAddressId?: string;
  billingAddressId?: string;
  paymentIntentId?: string;
  orderId?: string;
};
