"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  login,
  logout,
  signup,
} from "@/app/auth/actions";
import type { AuthState } from "@/app/auth/actions";
import type { Viewer } from "@/lib/auth/dal";

type Mode = "login" | "join";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <span className="account-error">{messages[0]}</span>;
}

export function AccountAccessClient({ viewer, redirectTo }: { viewer: Viewer | null; redirectTo: string }) {
  const [open, setOpen] = useState<Mode | null>(null);
  const initialAuthState: AuthState = { status: "idle" };
  const [loginState, loginAction, loginPending] = useActionState(login, initialAuthState);
  const [signupState, signupAction, signupPending] = useActionState(signup, initialAuthState);

  if (viewer) {
    const label = viewer.displayName || viewer.email || "Mon compte";
    return (
      <div className="account-entry account-entry-authenticated">
        <Link href="/compte" className="login-button" aria-label={`Mon compte, ${label}`}>
          <span className="face-icon" aria-hidden="true"><i /><b /></span>
          <span className="account-label">{label}</span>
        </Link>
        <form action={logout}><button className="account-logout" type="submit">Sortir</button></form>
      </div>
    );
  }

  const state = open === "join" ? signupState : loginState;
  const pending = open === "join" ? signupPending : loginPending;

  return (
    <>
      <div className="account-entry">
        <button onClick={() => setOpen("join")} className="join-button">Rejoindre</button>
        <button onClick={() => setOpen("login")} className="login-button" aria-label="Mon compte">
          <span className="face-icon" aria-hidden="true"><i /><b /></span>
          <span className="account-label">Mon compte</span>
        </button>
      </div>
      {open && (
        <div className="account-overlay" onClick={() => setOpen(null)}>
          <section className="account-panel" role="dialog" aria-modal="true" aria-label={open === "login" ? "Connexion" : "Créer un compte"} onClick={(event) => event.stopPropagation()}>
            <button className="account-close" onClick={() => setOpen(null)} aria-label="Fermer">×</button>
            <p className="account-kicker">{open === "login" ? "BON RETOUR PARMI NOUS" : "BIENVENUE CHEZ YAQEEN"}</p>
            <h2>{open === "login" ? "Connectez-vous." : "Rejoignez la communauté."}</h2>
            <p className="account-lead">{open === "login" ? "Retrouvez vos commandes, vos favoris et toutes vos boutiques." : "Un seul compte pour acheter auprès de tous les vendeurs Yaqeen."}</p>
            <form action={open === "login" ? loginAction : signupAction}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              {open === "join" && <label>Votre nom<input name="displayName" autoComplete="name" required minLength={2} maxLength={80} /><FieldError messages={state.fieldErrors?.displayName} /></label>}
              <label>Adresse e-mail<input name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required /><FieldError messages={state.fieldErrors?.email} /></label>
              <label>Mot de passe<input name="password" type="password" autoComplete={open === "login" ? "current-password" : "new-password"} placeholder="8 caractères minimum" required minLength={8} maxLength={72} /><FieldError messages={state.fieldErrors?.password} /></label>
              {state.message && <p className={`account-feedback ${state.status}`}>{state.message}</p>}
              <button type="submit" disabled={pending} className="account-submit">{pending ? "Un instant…" : open === "login" ? "Se connecter →" : "Créer mon compte →"}</button>
            </form>
            {open === "login" && <Link className="account-forgot" href="/compte/mot-de-passe-oublie">Mot de passe oublié ?</Link>}
            <div className="account-switch">{open === "login" ? <>Pas encore membre ? <button onClick={() => setOpen("join")}>Créer un compte</button></> : <>Déjà membre ? <button onClick={() => setOpen("login")}>Se connecter</button></>}</div>
            <div className="seller-suggestion"><div><span>Vous êtes commerçant ?</span><strong>Vendez vos produits sur Yaqeen Market.</strong><small>Créez d’abord votre compte, puis ouvrez gratuitement votre espace vendeur.</small></div><Link href="/seller">Découvrir Yaqeen Seller ↗</Link></div>
          </section>
        </div>
      )}
    </>
  );
}
