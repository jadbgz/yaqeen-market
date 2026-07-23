"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  enforceRateLimit,
  type RateLimitPolicy,
} from "@/lib/security/rate-limit";
import { getTrustedClientIp } from "@/lib/security/request-identity";
import { getSiteUrl, getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error" | "confirmation";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "email" | "password" | "currentPassword", string[]>>;
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
const resetSchema = z.object({ email });
const newPasswordSchema = z.object({ password });
const changePasswordSchema = z.object({ currentPassword: password, password });

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
    return {
      status: "confirmation",
      message: "Vérifiez votre boîte e-mail pour confirmer la création de votre compte.",
    };
  }

  return { status: "error", message: "La demande n’a pas pu aboutir. Réessayez dans quelques instants." };
}

function safeRedirect(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/compte";
}

function isRecoverySession(claims: Record<string, unknown>) {
  const methods = claims.amr;
  return Array.isArray(methods) && methods.some((entry) =>
    typeof entry === "object" && entry !== null && "method" in entry && entry.method === "recovery"
  );
}

async function authRateLimit(policy: RateLimitPolicy): Promise<AuthState | null> {
  const requestHeaders = await headers();
  const decision = await enforceRateLimit(policy, [
    { kind: "ip", value: getTrustedClientIp(requestHeaders) },
  ]);

  if (decision.status === "limited") {
    return {
      status: "error",
      message: "Trop de tentatives. Patientez avant de réessayer.",
    };
  }
  if (decision.status === "unavailable") {
    return {
      status: "error",
      message: "La protection de sécurité est momentanément indisponible. Réessayez dans quelques instants.",
    };
  }
  return null;
}

export async function login(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const rateLimitState = await authRateLimit("authLoginIp");
  if (rateLimitState) return rateLimitState;
  if (!getSupabaseConfig()) return unavailableState();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return providerError(error.message);

  redirect(redirectTo);
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
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const rateLimitState = await authRateLimit("authSignupIp");
  if (rateLimitState) return rateLimitState;
  if (!getSupabaseConfig()) return unavailableState();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) return providerError(error.message);
  if (data.session) redirect(redirectTo);

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

export async function requestPasswordReset(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  const rateLimitState = await authRateLimit("authResetIp");
  if (rateLimitState) return rateLimitState;
  if (!getSupabaseConfig()) return unavailableState();

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/compte/mot-de-passe")}`,
  });
  return {
    status: "confirmation",
    message: "Si un compte correspond à cette adresse, un lien sécurisé vient d’être envoyé.",
  };
}

export async function updateRecoveredPassword(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!getSupabaseConfig()) return unavailableState();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub || !isRecoverySession(claims.claims as Record<string, unknown>)) {
    return { status: "error", message: "Ce lien a expiré. Demandez-en un nouveau." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return providerError(error.message);
  return { status: "confirmation", message: "Votre mot de passe a été mis à jour." };
}

export async function changePassword(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!getSupabaseConfig()) return unavailableState();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const viewerEmail = typeof claims?.claims.email === "string" ? claims.claims.email : null;
  if (!viewerEmail) return { status: "error", message: "Reconnectez-vous avant de modifier votre mot de passe." };
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: viewerEmail,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { status: "error", message: "Le mot de passe actuel est incorrect." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return providerError(error.message);
  return { status: "confirmation", message: "Votre mot de passe a été modifié." };
}
