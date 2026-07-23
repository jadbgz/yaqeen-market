"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type MfaView = "loading" | "unenrolled" | "challenge" | "verified";

export function MfaPanel({ privileged }: { privileged: boolean }) {
  const [view, setView] = useState<MfaView>("loading");
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const supabase = createClient();
      const [{ data: factorData }, { data: assurance }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!active) return;
      const verified = factorData?.totp.find((factor) => factor.status === "verified");
      setVerifiedFactorId(verified?.id ?? null);
      setView(
        assurance?.currentLevel === "aal2"
          ? "verified"
          : verified
            ? "challenge"
            : "unenrolled",
      );
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: privileged ? "Yaqeen Operations" : "Yaqeen Market",
    });
    if (error || !data?.totp) {
      setMessage("L’enrôlement n’a pas pu démarrer. Réessayez.");
    } else {
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    }
    setBusy(false);
  };

  const verify = async () => {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    if (!factorId || !/^[0-9]{6}$/.test(code)) {
      setMessage("Saisissez les 6 chiffres affichés par votre application.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      setMessage("Code invalide ou expiré. Attendez le prochain code puis réessayez.");
      setBusy(false);
      return;
    }
    window.location.reload();
  };

  return (
    <section className="mfa-panel">
      <p>DOUBLE AUTHENTIFICATION</p>
      <h2>Application d’authentification</h2>
      {privileged && (
        <p className="mfa-notice">
          Obligatoire pour accéder aux opérations Yaqeen. Le mot de passe seul ne suffit plus.
        </p>
      )}

      {view === "loading" && <p className="account-hint">Vérification du niveau de sécurité…</p>}

      {view === "unenrolled" && !enrollment && (
        <>
          <p className="account-hint">
            Utilisez 1Password, Bitwarden, Google Authenticator ou une application TOTP équivalente.
          </p>
          <button className="account-primary" type="button" disabled={busy} onClick={startEnrollment}>
            {busy ? "Préparation…" : "Activer la double authentification"}
          </button>
        </>
      )}

      {enrollment && (
        <div className="mfa-enrollment">
          <p>Scannez ce QR code, puis confirmez avec le code à 6 chiffres.</p>
          <Image src={enrollment.qrCode} alt="QR code TOTP Yaqeen" width={200} height={200} unoptimized />
          <details>
            <summary>Saisie manuelle</summary>
            <code>{enrollment.secret}</code>
          </details>
        </div>
      )}

      {(view === "challenge" || enrollment) && (
        <div className="mfa-challenge">
          {!enrollment && <p>Confirmez votre identité pour ouvrir une session renforcée.</p>}
          <label>
            Code temporaire
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </label>
          <button className="account-primary" type="button" disabled={busy} onClick={verify}>
            {busy ? "Vérification…" : enrollment ? "Confirmer l’activation" : "Déverrouiller les opérations"}
          </button>
        </div>
      )}

      {view === "verified" && (
        <p className="account-form-feedback success">
          Session renforcée active. Les opérations sensibles sont déverrouillées.
        </p>
      )}
      {message && <p className="account-form-feedback error">{message}</p>}
    </section>
  );
}
