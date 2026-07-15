# ADR-001 — Surfaces web et mobiles

- Statut : proposé
- Décision attendue : après le GO de la phase 0
- Portée : C4 Plateforme, C5 Commerce, C6 Apps

## Décision

Yaqeen sera construit comme un produit multi-surface autour d'un même domaine métier et d'une même API :

1. **Marketplace web** — Next.js, publique, indexable et responsive. C'est le site associé, le point d'entrée SEO et l'expérience d'achat universelle.
2. **Application client** — Expo / React Native, distribuée comme application native iOS et Android. Elle ne sera pas une WebView du site.
3. **Seller Center** — application web responsive d'abord. Une app vendeur native ne sera créée que si les usages terrain (notifications, scan, préparation) le justifient.
4. **Back-office opérateur** — web uniquement.

## Architecture cible après le gate

```text
apps/web            Marketplace et contenus SEO
apps/mobile         Application Expo iOS / Android
apps/seller         Seller Center responsive
apps/admin          Opérations Yaqeen
packages/contracts  Schémas et types d'API partagés
packages/domain     Règles métier sans dépendance UI
packages/tokens     Couleurs, typographie et espacements
```

Les données, prix, stocks, commandes, identités et règles de conformité vivent côté API. Les clients web et mobiles consomment les mêmes contrats versionnés. Les composants visuels ne sont pas mutualisés artificiellement entre DOM et React Native ; seuls les tokens, contenus et règles métier le sont.

## Principes de déploiement

- Deep links et universal links pour ouvrir une fiche produit dans l'app depuis le web.
- Authentification et panier synchronisables entre surfaces.
- Environnements séparés : local, preview, staging et production.
- Builds signés et reproductibles via EAS Build ; soumission pilotée via EAS Submit.
- Publication progressive par cohortes et capacité de désactiver une fonction à distance.
- Aucun secret dans les bundles clients.

## Pourquoi pas une app vendeur native tout de suite

Le Seller Center responsive couvre désormais la création sécurisée d'une boutique et son état réel. Catalogue et commandes restent à construire. La priorité native sera donnée à l'acheteur ; les fonctions vendeur natives ne seront engagées qu'après mesure de la fréquence de préparation, du besoin de scan et du taux d'usage mobile.

## Gate de mise en œuvre

Cette architecture est préparée maintenant, mais le monorepo mobile et l'infrastructure de production ne sont engagés qu'après validation C1 : offre vendeurs, assortiment de lancement et signaux de demande suffisants.
