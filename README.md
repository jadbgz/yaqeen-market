# Yaqeen Market

Marketplace halal multi-vendeurs : livres, mode, parfums, cosmétique, compléments alimentaires et produits du quotidien.

## Vision

Yaqeen Market permet aux clients d’acheter auprès de boutiques indépendantes dans un environnement de confiance, et aux vendeurs de créer et gérer leur propre boutique en ligne.

Le click & collect ne fait pas partie du périmètre.

## Lancer le projet

```bash
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

L'inscription et la connexion utilisent Supabase Auth. Renseigner dans `.env.local` l'URL et la clé publiable fournies par Supabase. Ne jamais exposer une clé `secret` ou `service_role` dans une variable `NEXT_PUBLIC_*`.

## Tester le paiement web

Le checkout refuse toute clé Stripe live. Renseigner uniquement les clés `pk_test_…`, `sk_test_…`, le secret webhook `whsec_…`, la clé `service_role` Supabase côté serveur et `STRIPE_TEST_CHECKOUT_ENABLED=true` dans `.env.local`.

Pour recevoir localement les événements signés avec la CLI Stripe :

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copier le secret `whsec_…` affiché par la CLI, redémarrer Next.js, puis utiliser exclusivement une carte de test Stripe. Le paiement live, les transferts vendeurs et les remboursements restent volontairement désactivés.

## Lancer l'application mobile

```bash
Set-Location apps/mobile
npm ci
Copy-Item .env.example .env.local
npm run start
```

Renseigner `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SITE_URL` et, pour PaymentSheet, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` avec une clé `pk_test_…`. Seules les clés publiques Supabase et Stripe peuvent être embarquées ; les droits effectifs restent contrôlés par les politiques RLS et les frontières serveur.

Les identités natives de développement, preview et production sont isolées. Consulter `docs/MOBILE-RELEASE.md` pour les profils EAS, les callbacks Auth et le verrou de mise en production.

Vérifications mobiles :

```bash
npm run lint
npm run typecheck
npm run doctor
npx expo export --platform all --output-dir dist-ci
```

## Base locale

Prérequis : Node.js 20+ et un runtime compatible Docker. Le runtime de conteneurs n'est pas inclus dans le dépôt.

```bash
npm run db:start
npm run db:test
npm run db:lint
```

`supabase/config.toml`, les migrations, le seed non sensible et les tests pgTAP sont versionnés. Les données et secrets locaux ne le sont pas.

## Vérifications

```bash
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Les tests E2E démarrent Next.js sur le port `3100` et vérifient les parcours publics sur des profils bureau et mobile. Le parcours de commande connecté nécessite l'environnement de staging et sera activé séparément.

## Qualifier un staging

Le serveur expose une sonde publique minimale sur `/api/health/live` et une
sonde profonde protégée sur `/api/health/ready`. La configuration, l'identité
du commit, Supabase et Stripe test doivent toutes être valides avant que la
seconde retourne `ready`.

Le contrat complet, les variables GitHub et la séquence de contrôle sont
décrits dans [`docs/STAGING-RUNBOOK.md`](docs/STAGING-RUNBOOK.md). Aucun
environnement distant n'est créé ou relié automatiquement depuis le dépôt.
