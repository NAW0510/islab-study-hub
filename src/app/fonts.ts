import { Hanken_Grotesk } from "next/font/google";

/**
 * Display face for headings, big numerals and navigation (a variable font,
 * so every weight comes from one file). Importing this in the root layout
 * preloads it everywhere.
 */
export const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});
