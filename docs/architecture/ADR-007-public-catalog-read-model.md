# ADR-007 — Modèle de lecture du catalogue public

- Statut : accepté
- Date : 2026-07-15
- Portée : storefront web, catalogue, confiance, SEO

## Décision

Le storefront web lit PostgreSQL via le client public Supabase et les policies RLS. `src/data/products.ts` est supprimé : aucune donnée produit de démonstration ne constitue désormais une source de vérité web.

Une ligne n'est affichable que si toutes les conditions suivantes sont réunies :

- produit `published` ;
- boutique `approved` ;
- variante active avec prix strictement positif ;
- preuve `approved` avec résumé public non vide.

La DAL serveur applique ces conditions explicitement en plus des policies RLS. Une erreur de lecture produit un catalogue vide et journalise l'erreur côté serveur ; elle ne réactive jamais des fixtures silencieuses.

## Identité et URL

Un slug produit n'est unique qu'à l'intérieur d'une boutique. L'URL canonique est donc `/produit/{shopSlug}/{productSlug}`. Ce couple est stable, lisible et évite les collisions entre vendeurs.

## Surface de confiance

La fiche publique expose la nature, le périmètre, l'émetteur, la référence éventuelle et le résumé public de la preuve. Elle n'affiche ni note, ni volume d'avis, ni classement commercial sans donnée persistée correspondante.

## Indexation et fraîcheur

- métadonnées produit générées depuis la même lecture publique ;
- données structurées Schema.org `Product` et `Offer` ;
- page d'accueil régénérée au plus toutes les cinq minutes ;
- catalogue et fiches rendus à la demande.

## Limites suivantes

Le modèle actuel choisit la variante active la moins chère. Le sélecteur multi-variantes, les images Supabase Storage, la recherche PostgreSQL plein texte et la convergence Expo seront traités séparément. Le panier reste local et le paiement est explicitement désactivé.
