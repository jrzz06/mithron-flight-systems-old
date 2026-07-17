import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatInrDisplay } from "@/lib/currency";

export function formatINR(value: number) {
  return formatInrDisplay(value);
}

/** Storefront label for catalog/list prices (Indian Rupee, en-IN grouping). */
export function formatFromINR(value: number) {
  return `From ${formatINR(value)}`;
}

export const STORE_CURRENCY_CODE = "INR" as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
