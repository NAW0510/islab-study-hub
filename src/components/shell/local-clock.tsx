"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "--:--";

// Device time with its zone, e.g. "23.41 WIB". This is the reader's own clock;
// dates and week numbers elsewhere use the app timezone (see TIMEZONE in utils).
const formatter = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}

/**
 * The server (and the first client render) shows "--:--", so there is no
 * hydration mismatch; the real time appears right after mount.
 */
export function LocalClock({ className }: { className?: string }) {
  const time = useSyncExternalStore(
    subscribe,
    () => formatter.format(new Date()),
    () => PLACEHOLDER,
  );

  return <span className={cn("tabular-nums", className)}>{time}</span>;
}
