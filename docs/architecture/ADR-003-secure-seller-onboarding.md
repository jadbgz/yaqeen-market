# ADR-003 — Onboarding vendeur transactionnel

- Statut : accepté pour le premier parcours vendeur
- Date : 2026-07-15
- Portée : C5, C6, C11, C16

## Décision

La création d'une boutique, l'ajout de son propriétaire dans `shop_members` et le passage du profil de `customer` à `seller` forment une seule transaction PostgreSQL, exposée par la fonction contrôlée `create_seller_shop`.

Le navigateur ne peut modifier directement ni le rôle d'un profil, ni le statut d'approbation d'une boutique. La fonction exige une identité `auth.uid()`, valide à nouveau toutes les données côté base et reste inaccessible au rôle anonyme.

## Limite initiale

Un compte peut posséder une seule boutique pendant la première version. Cette contrainte est garantie par un index unique, pas uniquement par l'interface. Les collaborateurs et délégations restent possibles via `shop_members`.

Cette limite sera réévaluée uniquement lorsqu'un besoin réel de portefeuille multi-boutiques sera démontré.

## États visibles

- sans configuration backend : état technique explicite, aucune simulation ;
- sans session : connexion au compte Yaqeen existant ;
- sans boutique : formulaire d'onboarding réel ;
- avec boutique : tableau de bord calculé depuis les produits, variantes, stocks et preuves persistés.

Commandes, chiffre d'affaires, conversion et scores de santé ne sont pas affichés avant l'existence de tables et d'événements réels correspondants.

## Contrôles

La CI rejoue la migration sur une base neuve et vérifie notamment :

- l'accès à la fonction réservé aux utilisateurs authentifiés ;
- son exécution en `security definer` avec `search_path` verrouillé ;
- la création atomique de la boutique, de l'adhésion propriétaire et du rôle vendeur ;
- l'unicité d'une boutique propriétaire par compte.
