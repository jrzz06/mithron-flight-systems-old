/** Shared Tailwind class groups for admin orders layout resilience. */

export const orderLongText = "min-w-0 break-words [overflow-wrap:anywhere]";

export const orderClamp2 = "line-clamp-2";

export const orderTruncateEllipsis = "min-w-0 truncate";

export const orderWrapRow = "flex flex-wrap items-center gap-2";

export const orderScrollX = "min-w-0 overflow-x-auto";

/** Primary card / panel radius — matches --platform-radius (10px). */
export const orderRadiusCard = "rounded-[var(--platform-radius)]";

/** Nested cards, controls, badges — 8px. */
export const orderRadiusControl = "rounded-[8px]";

/** Card internal padding — 16px (8px grid). */
export const orderCardPad = "p-4";

/** Section label — sentence case, platform caption scale. */
export const orderSectionLabel =
  "mb-2 shrink-0 platform-type-caption font-semibold text-[var(--platform-text-muted)]";

/** Sticky section label within the detail scrollport. */
export const orderSectionLabelSticky =
  `${orderSectionLabel} sticky top-0 z-10 bg-[var(--platform-surface)] py-1`;

/** Gap between stacked cards in the center column — 16px. */
export const orderCardStack = "grid min-w-0 gap-4";

/** Inner product / nested card padding. */
export const orderNestedCardPad = "p-4";

/** Standard vertical rhythm between sibling cards inside a section. */
export const orderSectionStack = "grid gap-4";

/** Divider between action-rail groups. */
export const orderRailDivider = "border-t border-[var(--platform-border)] pt-4";

/** Standard form control height and padding. */
export const orderInputClass =
  "h-10 w-full border border-[var(--platform-border-strong)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:border-[var(--platform-focus-border)]";

/** Full-width rail / form submit button shell. */
export const orderButtonClass = "h-10 w-full px-3 text-sm font-medium";

/** Compact inline action button. */
export const orderInlineButtonClass =
  `inline-flex h-10 items-center ${orderRadiusControl} border border-[var(--platform-border-strong)] px-4 text-sm font-medium`;

/** Product line item card: container-aware image + details split. */
export const orderProductCardGrid =
  `grid min-w-0 gap-4 border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 @sm:grid-cols-[6rem_minmax(0,1fr)] ${orderRadiusControl}`;

/** Content column inside a product card. */
export const orderProductCardBody = "@container min-w-0 space-y-2";
