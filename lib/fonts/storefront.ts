import { Instrument_Sans } from "next/font/google";
import { GeistSans } from "geist/font/sans";

export const fontDisplay = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/** Body/UI — Geist Sans */
export const fontBody = GeistSans;
