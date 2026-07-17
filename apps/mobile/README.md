# Yaqeen Market — application universelle

Application Expo 57 destinée à iOS, Android et au web. Le catalogue mobile utilise la même base Supabase/PostgreSQL et les mêmes règles RLS que le storefront Next.js.

## Configuration locale

1. Copier `.env.example` vers `.env.local` dans `apps/mobile`.
2. Renseigner l'URL Supabase et sa clé **publique** (`publishable`).
3. Lancer `npm ci`, puis `npm run web`, `npm run ios` ou `npm run android`.

Expo injecte les variables `EXPO_PUBLIC_*` dans le bundle client. Elles sont donc lisibles par l'utilisateur final : aucune clé secrète, clé `service_role` ou donnée privée ne doit y être placée.

## Contrat de lecture

Une fiche n'est affichée que si le produit est `published`, la boutique `approved`, une variante active et tarifée existe, et une preuve `approved` possède un résumé public. La RLS PostgreSQL reste l'autorité ; les filtres mobiles constituent une défense supplémentaire.

Sans configuration ou en cas d'erreur réseau, l'application affiche un état explicite et ne remplace jamais les données par des fixtures. Les commandes et paiements sont désactivés jusqu'à l'implémentation du backend correspondant.

## Contrôles

```bash
npm run lint
npx tsc --noEmit
npx expo export --platform web
```
