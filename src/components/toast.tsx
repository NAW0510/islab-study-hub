"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

type Toast = { message: string; actionLabel?: string; onAction?: () => void };

const ToastContext = createContext<(toast: Toast) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/** One toast at a time, bottom-center, with an optional action ("Urungkan"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(undefined);

  const show = useCallback((next: Toast) => {
    setToast(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 print:hidden">
          <div className="flex items-center gap-3 rounded-btn bg-primary py-2.5 pr-3 pl-4 text-sm text-primary-fg shadow-lg">
            <Check className="size-4 shrink-0" />
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="rounded-btn px-2 py-1 font-semibold text-accent-soft underline-offset-2 hover:underline"
                onClick={() => {
                  window.clearTimeout(timer.current);
                  setToast(null);
                  toast.onAction?.();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext>
  );
}
