"use client";
import { useState } from "react";
import Link from "next/link";

export function AccountAccess(){
  const [open,setOpen]=useState<"login"|"join"|null>(null);
  return <>
    <div className="account-entry">
      <button onClick={()=>setOpen("join")} className="join-button">Rejoindre</button>
      <button onClick={()=>setOpen("login")} className="login-button"><span className="face-icon" aria-hidden="true"><i/><b/></span><span className="account-label">Mon compte</span></button>
    </div>
    {open&&<div className="account-overlay" onClick={()=>setOpen(null)}><section className="account-panel" role="dialog" aria-modal="true" aria-label={open==="login"?"Connexion":"Créer un compte"} onClick={event=>event.stopPropagation()}>
      <button className="account-close" onClick={()=>setOpen(null)} aria-label="Fermer">×</button>
      <p className="account-kicker">{open==="login"?"BON RETOUR PARMI NOUS":"BIENVENUE CHEZ YAQEEN"}</p><h2>{open==="login"?"Connectez-vous.":"Rejoignez la communauté."}</h2><p className="account-lead">{open==="login"?"Retrouvez vos commandes, vos favoris et toutes vos boutiques.":"Un seul compte pour acheter auprès de tous les vendeurs Yaqeen."}</p>
      <form><label>Adresse e-mail<input type="email" placeholder="vous@exemple.fr"/></label><label>Mot de passe<input type="password" placeholder="••••••••"/></label>{open==="join"&&<label className="account-consent"><input type="checkbox"/> Je souhaite recevoir les nouvelles de la communauté</label>}<button type="button" className="account-submit">{open==="login"?"Se connecter":"Créer mon compte"} →</button></form>
      <div className="account-switch">{open==="login"?<>Pas encore membre ? <button onClick={()=>setOpen("join")}>Créer un compte</button></>:<>Déjà membre ? <button onClick={()=>setOpen("login")}>Se connecter</button></>}</div>
      <div className="seller-suggestion"><div><span>Vous êtes commerçant ?</span><strong>Vendez vos produits sur Yaqeen Market.</strong><small>Créez d’abord votre compte, puis ouvrez gratuitement votre espace vendeur.</small></div><Link href="/seller">Découvrir Yaqeen Seller ↗</Link></div>
    </section></div>}
  </>;
}
