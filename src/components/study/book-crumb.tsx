"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { BookKey } from "../shell/nav-items";
import { preloadLibraryWorld } from "../vocab/library/world-preload";

const LABEL: Record<BookKey, string> = { istilah: "Istilah Teknis", bahasa: "Bahasa" };

/**
 * The way back to a book, first in the top bar's second row on the pages
 * that open from inside it (Daftar, Domain, the full Peta Otak, the Bahasa
 * list). The book opens again already open (no lift-off from the shelf).
 * Heading for it starts loading the Perpustakaan's world.
 */
export function BookCrumb({ book }: { book: BookKey }) {
  return (
    <Link
      href={`/studi?buku=${book}`}
      className="navbar-crumb"
      onPointerEnter={preloadLibraryWorld}
      onFocus={preloadLibraryWorld}
      onPointerDown={preloadLibraryWorld}
    >
      <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
      {LABEL[book]}
    </Link>
  );
}
