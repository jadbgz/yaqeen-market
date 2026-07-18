# ADR-013 — Exécution vendeur et suivi multi-boutique

- Statut : accepté et implémenté pour le pilote
- Date : 2026-07-18
- Portée : préparation, expédition, suivi client et protection des adresses

## Décision

Chaque boutique traite uniquement sa `shop_order`. Les transitions vendeur sont des RPC PostgreSQL et suivent la séquence fermée :

`paid → preparing → shipped`

Le passage à `shipped` exige un transporteur et un numéro de suivi normalisés. Les écritures directes restent interdites. Une répétition strictement identique est idempotente ; une tentative de remplacer un suivi déjà enregistré est refusée.

Après chaque transition, PostgreSQL verrouille et recalcule l’agrégat client : `processing`, `partially_shipped` ou `shipped`. Ainsi, deux vendeurs d’un même panier peuvent agir concurremment sans que le navigateur décide du statut global.

## Autorisation et données personnelles

Seuls le propriétaire et les membres `owner`, `manager` ou `fulfillment` peuvent lire et traiter les commandes d’une boutique. Le rôle `catalog` ne peut lire ni commandes, ni articles commandés, ni adresse de livraison.

Le vendeur reçoit uniquement le snapshot d’adresse nécessaire à l’exécution. Il ne reçoit pas l’identité du compte, l’e-mail client, les autres sous-commandes, les tentatives de paiement ni la ventilation financière des autres boutiques.

## Livraison

Le vendeur ne peut pas déclarer lui-même une commande `delivered`. Cette transition sera alimentée par une preuve transporteur ou une frontière opérateur dédiée. Cela évite de transformer une simple déclaration vendeur en preuve de livraison.

## Audit

Chaque changement de sous-commande conserve l’acteur, l’ancien statut, le nouveau statut et un motif stable. Les changements de l’agrégat sont journalisés séparément. Les tests pgTAP couvrent l’IDOR inter-boutiques, le rôle catalogue, les écritures directes, l’ordre des transitions, la validation du suivi et les replays.
