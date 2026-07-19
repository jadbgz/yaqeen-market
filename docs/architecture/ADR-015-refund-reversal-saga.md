# ADR-015 — Saga remboursement et reversal

- Statut : accepté et implémenté en bac à sable
- Date : 2026-07-19
- Portée : remboursement intégral d’une sous-commande et récupération d’un transfert vendeur

## Décision

Le premier flux remboursable porte sur l’intégralité d’une `shop_order`. Aucun montant arbitraire n’est saisi : PostgreSQL reprend le total figé de la sous-commande. Les remboursements partiels par ligne, frais de port ou geste commercial restent fermés jusqu’à modélisation explicite des retours et allocations.

Une demande exige un opérateur, un motif Stripe fermé et une justification interne. Elle produit une ligne idempotente avant tout appel externe. Le remboursement Stripe est ensuite créé avec la charge source et des identifiants internes non personnels en métadonnées.

## Autorité et ordre des effets

Les événements signés `refund.created`, `refund.updated` et `refund.failed` sont l’autorité sur l’état du remboursement. Le webhook récupère l’objet Stripe courant, rapproche identifiant, montant et devise, puis met à jour la sous-commande et l’agrégat multi-vendeur.

Le client est remboursé avant la récupération éventuelle des fonds vendeur. Si un transfert avait été soumis, un reversal intégral du net vendeur est préparé avec une clé d’idempotence distincte. Un échec de reversal reste journalisé et rejouable ; il ne révoque pas le remboursement client déjà acquis.

## Conservation de l’historique

`refunded` est un état métier courant, pas l’effacement du cycle logistique. Le transporteur, le suivi, l’expédition et la livraison restent conservés. Les contraintes PostgreSQL vérifient désormais la cohérence des preuves de cycle de vie indépendamment du statut courant.

## Limites

Le flux demeure sandbox. Retours physiques, remboursements partiels, litiges, réserve de trésorerie, payouts et procédures live restent à traiter avant activation commerciale.

## Références vérifiées

- https://docs.stripe.com/refunds
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/api/idempotent_requests
