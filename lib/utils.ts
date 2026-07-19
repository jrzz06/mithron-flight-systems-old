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
