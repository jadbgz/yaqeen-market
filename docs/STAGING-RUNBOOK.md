# Runbook de staging

Le staging Yaqeen est une frontière de recette isolée. Il ne partage ni base,
ni secrets, ni webhooks avec la production. Il utilise exclusivement Stripe
test et ne contient aucune donnée personnelle réelle.

## Résultat attendu

Un commit de `main` n'est qualifié pour une recette que lorsque le workflow
`Staging release gate` prouve simultanément :

1. que le commit exposé par l'application est exactement le commit contrôlé ;
2. que la configuration serveur ne contient ni placeholder ni URL locale ;
3. que PostgreSQL répond avec la clé serveur attendue ;
4. que le compte plateforme Stripe test répond et n'est pas en mode live ;
5. que le checkout atteint la frontière d'authentification sans erreur de
   configuration ou de paiement.

`/api/health/live` est une sonde publique minimale. `/api/health/ready` réalise
les contrôles profonds et répond comme une route inexistante sans jeton valide.
Les deux réponses sont non cachables et non indexables.

## 1. Créer les ressources externes

- créer un projet Supabase réservé au staging ;
- appliquer toutes les migrations avec la CLI après vérification explicite de
  la référence liée ;
- créer un endpoint Stripe test distinct pointant vers
  `/api/stripe/webhook` ;
- déployer le serveur Next.js sur une origine HTTPS dédiée ;
- autoriser cette origine et les callbacks `/auth/confirm` dans Supabase ;
- ne jamais réutiliser un secret ou une base de production.

La liaison Supabase et les écritures sur les comptes externes sont des actions
de propriétaire : contrôler `supabase projects list`, puis la référence ciblée,
avant `supabase link` et `supabase db push`.

## 2. Configurer le serveur de staging

Variables publiques :

- `YAQEEN_ENVIRONMENT=staging`
- `YAQEEN_RELEASE_SHA=<sha Git de 40 caractères>`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `STRIPE_TEST_CHECKOUT_ENABLED=true`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`

Secrets serveur :

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `YAQEEN_HEALTHCHECK_TOKEN` aléatoire, au moins 32 caractères

Le serveur refuse de démarrer en staging si ce contrat est incomplet. Le mode
production reste volontairement bloqué tant que le passage à Stripe live n'a
pas son propre ADR, ses tests et sa procédure de rollback.

## 3. Configurer l'environnement GitHub `staging`

Variables :

- `STAGING_BASE_URL`
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_PUBLISHABLE_KEY`
- `STAGING_STRIPE_PUBLISHABLE_KEY`

Secrets :

- `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_STRIPE_SECRET_KEY`
- `STAGING_STRIPE_WEBHOOK_SECRET`
- `STAGING_HEALTHCHECK_TOKEN`

Protéger l'environnement avec une approbation humaine. Aucun secret n'est
imprimé par la gate ; seules des catégories d'erreurs stables sont retournées.

## 4. Exécuter et interpréter la gate

Déployer d'abord le commit de `main`, avec son SHA dans
`YAQEEN_RELEASE_SHA`. Lancer ensuite manuellement `Staging release gate`.

- `200 ready` : configuration, base, Stripe test et identité du release sont
  cohérents ;
- `404` sur readiness : jeton absent ou incorrect ;
- `503 not_ready` : dépendance ou configuration indisponible ;
- divergence de SHA : le déploiement contrôlé n'est pas le commit demandé.

Cette gate ne remplace pas encore le parcours authentifié complet. La prochaine
extension doit provisionner des identités de recette jetables et vérifier :
client → commande multi-boutique → webhook → vendeur → livraison → transfert →
remboursement, sans donnée personnelle réelle.
