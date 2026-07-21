import {
  ArrowLeft as LucideArrowLeft,
  ArrowRight as LucideArrowRight,
  ChevronDown as LucideChevronDown,
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
  Home as LucideHome,
  Minus as LucideMinus,
  Plus as LucidePlus,
  Search as LucideSearch,
  ThumbsUp as LucideThumbsUp,
  UserRound as LucideUserRound,
  X as LucideX,
  type LucideIcon,
  type LucideProps
} from "lucide-react";
import { forwardRef } from "react";

/** Default stroke for storefront chrome — thinner than admin (2). */
export const STOREFRONT_ICON_STROKE = 1.5;

function createStorefrontIcon(Icon: LucideIcon, displayName: string) {
  const StorefrontIcon = forwardRef<SVGSVGElement, LucideProps>(function StorefrontIcon(
    { strokeWidth, ...props },
    ref
  ) {
    return <Icon ref={ref} strokeWidth={strokeWidth ?? STOREFRONT_ICON_STROKE} {...props} />;
  });
  StorefrontIcon.displayName = displayName;
  return StorefrontIcon;
}

export const ArrowLeft = createStorefrontIcon(LucideArrowLeft, "StorefrontArrowLeft");
export const ArrowRight = createStorefrontIcon(LucideArrowRight, "StorefrontArrowRight");
export const ChevronDown = createStorefrontIcon(LucideChevronDown, "StorefrontChevronDown");
export const ChevronLeft = createStorefrontIcon(LucideChevronLeft, "StorefrontChevronLeft");
export const ChevronRight = createStorefrontIcon(LucideChevronRight, "StorefrontChevronRight");
export const Home = createStorefrontIcon(LucideHome, "StorefrontHome");
export const Minus = createStorefrontIcon(LucideMinus, "StorefrontMinus");
export const Plus = createStorefrontIcon(LucidePlus, "StorefrontPlus");
export const Search = createStorefrontIcon(LucideSearch, "StorefrontSearch");
export const ThumbsUp = createStorefrontIcon(LucideThumbsUp, "StorefrontThumbsUp");
export const UserRound = createStorefrontIcon(LucideUserRound, "StorefrontUserRound");
export const X = createStorefrontIcon(LucideX, "StorefrontX");
