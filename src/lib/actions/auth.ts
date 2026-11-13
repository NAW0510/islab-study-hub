"use server";

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { safeNextPath } from "../utils";
import { str } from "./form";

export type SignInState = { error?: string; email?: string };

/**
 * Used with useActionState and `<form action={...}>`, so it also works when the
 * page's JavaScript failed to load (the browser then POSTs the form natively —
 * credentials never end up in the URL).
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = str(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || !password) {
    return { error: "Email dan password wajib diisi.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      email,
      error:
        error.code === "invalid_credentials"
          ? "Email atau password salah."
          : `Login gagal: ${error.message}`,
    };
  }

  redirect(safeNextPath(formData.get("next")));
}
