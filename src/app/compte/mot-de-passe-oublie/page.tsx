import { AccountHeader } from "@/components/account-header";
import { PasswordResetRequestForm } from "@/components/password-forms";

export default function ForgotPasswordPage() {
  return <main className="member-shell"><AccountHeader back="/" label="Retour au marché" />
    <section className="auth-standalone"><p>ACCÈS AU COMPTE</p><h1>Retrouver<br />votre accès.</h1><p>Indiquez votre adresse e-mail. La réponse reste volontairement identique, qu’un compte existe ou non.</p><PasswordResetRequestForm /></section>
  </main>;
}
