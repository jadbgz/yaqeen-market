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

## Lancer l'application mobile

```bash
Set-Location apps/mobile
npm ci
Copy-Item .env.example .env.local
npm run start
```

Renseigner `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `EXPO_PUBLIC_SITE_URL`. Seule la clé Supabase publiable doit être embarquée dans l'application ; les droits effectifs restent contrôlés par les politiques RLS de la base.

Le schéma natif est `yaqeen://`. Avant une distribution iOS ou Android, ajouter l'URL de rappel `yaqeen://auth/callback` et les URL web de production autorisées dans la liste des redirections Supabase Auth.

Vérifications mobiles :

```bash
npm run lint
npx expo customize tsconfig.json
npx tsc --noEmit
npx expo-doctor
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
```
