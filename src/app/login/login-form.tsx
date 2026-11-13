"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/action-form";
import { signIn, type SignInState } from "@/lib/actions/auth";

export function LoginForm({ next }: { next: string }) {
  // A plain server-action form (not onSubmit + fetch): if JavaScript never
  // loads, the browser still POSTs it, so the password can't leak into the URL.
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.email}
          className="input"
          placeholder="kamu@email.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      <SubmitButton className="w-full" pending={pending}>
        Masuk
      </SubmitButton>
      {state.error && <FormError message={state.error} />}
    </form>
  );
}
