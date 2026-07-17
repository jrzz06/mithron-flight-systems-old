/** Shared focus ring for operational shell navigation and actions — no visual change until keyboard focus. */
export const shellFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/55";

const shellNavLinkBase =
  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 md:w-full";
