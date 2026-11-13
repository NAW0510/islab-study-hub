"use client";

import { useState } from "react";

type Filters = Record<string, string | undefined>;

/**
 * Filter state that lives in the browser (instant, no server round trip) and
 * is mirrored into the query string, so reloading or sharing the URL keeps it.
 */
export function useUrlFilters<T extends Filters>(initial: T) {
  const [filters, setFilters] = useState<T>(initial);

  function update(patch: Partial<T>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
  }

  function reset() {
    update(Object.fromEntries(Object.keys(filters).map((k) => [k, undefined])) as Partial<T>);
  }

  return { filters, update, reset };
}
