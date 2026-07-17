# ADR-008 — Catalogue public universel web et mobile

- Statut : accepté
- Date : 2026-07-17
- Portée : Expo, iOS, Android, web, catalogue public

## Décision

L'application Expo lit directement l'API REST publique Supabase avec la clé `publishable`. Cette clé est conçue pour être exposée dans un client public ; la sécurité repose sur les grants et policies RLS PostgreSQL, jamais sur la confidentialité du bundle mobile.

Les fixtures `apps/mobile/src/data/products.ts` sont supprimées. Web et mobile appliquent désormais le même contrat d'affichage :

- produit `published` ;
- boutique `approved` ;
- variante active avec prix positif ;
- preuve `approved` et résumé public non vide.

## États dégradés

Le catalogue distingue quatre états : chargement, prêt, non configuré et erreur réseau. Aucun échec ne réactive silencieusement des données fictives. Une relance manuelle est proposée après une erreur réseau.

## Identité et navigation

La route produit mobile devient `/product/{shopSlug}/{productSlug}` afin d'éviter les collisions de slugs entre boutiques. Le panier identifie les lignes par UUID produit et borne l'ajout au stock disponible annoncé.

## Limites

- le panier n'est pas encore persisté ni revalidé côté serveur ;
- l'offre multi-variantes sélectionne provisoirement la variante active la moins chère ;
- les commandes, la livraison et le paiement restent désactivés ;
- les images seront traitées via Supabase Storage dans un chantier dédié.
