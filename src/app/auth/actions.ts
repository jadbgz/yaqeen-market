"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getSiteUrl, getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error" | "confirmation";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "email" | "password", string[]>>;
};

const email = z.email("Saisissez une adresse e-mail valide.").trim().toLowerCase();
const password = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.")
  .max(72, "Le mot de passe ne peut pas dépasser 72 caractères.");

const loginSchema = z.object({ email, password });
const signupSchema = loginSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "Indiquez un nom d’au moins 2 caractères.")
    .max(80, "Le nom ne peut pas dépasser 80 caractères."),
});

function unavailableState(): AuthState {
  return {
    status: "error",
    message: "L’authentification est prête, mais le projet Supabase doit encore être relié à cet environnement.",
  };
}

function providerError(message: string): AuthState {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return { status: "error", message: "E-mail ou mot de passe incorrect." };
  }
  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return { status: "error", message: "Un compte existe déjà avec cette adresse e-mail." };
  }

  return { status: "error", message: "La demande n’a pas pu aboutir. Réessayez dans quelques instants." };
}

export async function login(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!getSupabaseConfig()) return unavailableState();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return providerError(error.message);

  redirect("/compte");
}

export async function signup(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!getSupabaseConfig()) return unavailableState();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/compte`,
    },
  });

  if (error) return providerError(error.message);
  if (data.session) redirect("/compte");

  return {
    status: "confirmation",
    message: "Vérifiez votre boîte e-mail pour confirmer la création de votre compte.",
  };
}

export async function logout() {
  if (getSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
