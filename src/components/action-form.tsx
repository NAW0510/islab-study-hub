"use client";

import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { callAction } from "@/lib/call-action";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const PendingContext = createContext(false);

export function usePending() {
  return useContext(PendingContext);
}

/**
 * Form that calls a server action and shows its `{ error }` inline.
 * Unlike a plain `<form action>`, fields are NOT cleared when the action
 * returns an error, so a long note is never lost to a validation message.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await callAction(() => action(formData));
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      if (resetOnSuccess) form.reset();
      onSuccess?.();
    });
  }

  return (
    // method="post" is a safety net: if JS failed to load, form data must never go into the URL.
    <form method="post" onSubmit={handleSubmit} className={className} aria-busy={pending}>
      <PendingContext value={pending}>{children}</PendingContext>
      {error && <FormError message={error} />}
    </form>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="col-span-full basis-full rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  children,
  className,
  pending: pendingProp,
}: {
  children: ReactNode;
  className?: string;
  pending?: boolean;
}) {
  const pendingFromForm = usePending();
  const pending = pendingProp ?? pendingFromForm;
  return (
    <button type="submit" disabled={pending} className={cn("btn btn-primary", className)}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
