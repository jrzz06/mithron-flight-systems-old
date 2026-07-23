import localFont from "next/font/local";

/**
 * Primary interface — Google Sans Flex (variable: wght / opsz / wdth / …).
 * Latin + latin-ext full axis files from Fontsource.
 */
export const googleSansFlex = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-full-normal.woff2",
      weight: "1 1000",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-ext-full-normal.woff2",
      weight: "1 1000",
      style: "normal",
    },
  ],
  variable: "--font-google-sans-flex",
  display: "swap",
  // localFont accepts a metric-matched fallback name or false — not `true`.
  adjustFontFallback: "Arial",
});

/**
 * Headlines & UI text — Google Sans (variable).
 * Display/Text optical roles use Flex + font-variation-settings elsewhere.
 */
export const googleSans = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/google-sans/files/google-sans-latin-full-normal.woff2",
      weight: "400 700",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/google-sans/files/google-sans-latin-ext-full-normal.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-google-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});

/** @deprecated Use `googleSansFlex` — alias for layout/body variable wiring */
export const fontBody = googleSansFlex;

export const displayFontStack =
  "var(--font-google-sans), var(--font-google-sans-flex), system-ui, sans-serif";

export const bodyFontStack =
  "var(--font-google-sans-flex), system-ui, sans-serif";
