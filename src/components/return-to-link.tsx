"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

/** Link that tells the target page where to come back to (the current URL, filters included). */
export function ReturnToLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const returnTo = search ? `${pathname}?${search}` : pathname;
  const separator = href.includes("?") ? "&" : "?";
  return <Link href={`${href}${separator}return_to=${encodeURIComponent(returnTo)}`} {...props} />;
}
