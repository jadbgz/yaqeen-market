"use client";

import { useActionState } from "react";
import {
  changePassword,
  requestPasswordReset,
  updateRecoveredPassword,
  type AuthState,
} from "@/app/auth/actions";

const initialState: AuthState = { status: "idle" };

function Feedback({ state }: { state: AuthState }) {
  return state.message ? <p className={`account-feedback ${state.status}`}>{state.message}</p> : null;
}

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return <form action={action} className="account-form">
    <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label>
    <Feedback state={state} />
    <button className="account-primary" disabled={pending}>{pending ? "Envoi…" : "Recevoir le lien sécurisé"}</button>
  </form>;
}

export function RecoveredPasswordForm() {
  const [state, action, pending] = useActionState(updateRecoveredPassword, initialState);
  return <form action={action} className="account-form">
    <label>Nouveau mot de passe<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
    <Feedback state={state} />
    <button className="account-primary" disabled={pending}>{pending ? "Mise à jour…" : "Choisir ce mot de passe"}</button>
  </form>;
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initialState);
  return <form action={action} className="account-form">
    <label>Mot de passe actuel<input name="currentPassword" type="password" autoComplete="current-password" minLength={8} maxLength={72} required /></label>
    <label>Nouveau mot de passe<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
    <p className="account-hint">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
    <Feedback state={state} />
    <button className="account-primary" disabled={pending}>{pending ? "Mise à jour…" : "Modifier le mot de passe"}</button>
  </form>;
}
