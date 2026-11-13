import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * Display face for headings, big numerals and navigation. Importing this in a
 * page preloads it for that route only; importing it in the root layout
 * preloads it everywhere.
 */
export const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});
