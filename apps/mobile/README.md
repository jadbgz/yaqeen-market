# Yaqeen Market — application universelle

Application Expo 57 destinée à iOS, Android et au web. Le catalogue mobile utilise la même base Supabase/PostgreSQL et les mêmes règles RLS que le storefront Next.js.

Le panier est conservé sur l'appareil avec uniquement les identifiants de variantes et les quantités, puis rapproché du catalogue publié à chaque démarrage. Sur iOS et Android, le checkout de test utilise Stripe PaymentSheet après authentification Supabase, sélection d'une adresse et réservation serveur du stock. La confirmation finale provient toujours du webhook Stripe signé.

## Configuration locale

1. Copier `.env.example` vers `.env.local` dans `apps/mobile`.
2. Renseigner l'URL Supabase et sa clé **publique** (`publishable`).
3. Lancer `npm ci`, puis `npm run web`, `npm run ios` ou `npm run android`.

Expo injecte les variables `EXPO_PUBLIC_*` dans le bundle client. Elles sont donc lisibles par l'utilisateur final : aucune clé secrète, clé `service_role` ou donnée privée ne doit y être placée.

## Contrat de lecture

Une fiche n'est affichée que si le produit est `published`, la boutique `approved`, une variante active et tarifée existe, et une preuve `approved` possède un résumé public. La RLS PostgreSQL reste l'autorité ; les filtres mobiles constituent une défense supplémentaire.

Sans configuration ou en cas d'erreur réseau, l'application affiche un état explicite et ne remplace jamais les données par des fixtures.

Le paiement natif exige `EXPO_PUBLIC_SITE_URL` (HTTPS hors développement) et une clé `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` commençant par `pk_test_`. Apple Pay et Google Pay restent désactivés tant que les identifiants marchands et les builds de développement dédiés ne sont pas validés.

Les builds utilisent des identités séparées : `yaqeen-dev://`, `yaqeen-preview://` et `yaqeen://`. Ajouter le callback `/auth/callback` correspondant dans Supabase Auth. Les profils EAS, variables et gates sont décrits dans `../../docs/MOBILE-RELEASE.md`.

## Contrôles

```bash
npm run lint
npm run typecheck
npm run doctor
npx expo export --platform web
npx expo export --platform android
npx expo export --platform ios
```
