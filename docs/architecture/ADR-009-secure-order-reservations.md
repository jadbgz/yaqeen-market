# ADR-009 — Commandes multi-vendeurs et réservations de stock

- Statut : accepté pour le noyau pré-paiement
- Date : 2026-07-17
- Portée : commandes, sous-commandes vendeur, prix figés, stock et audit

## Contexte

Le panier client ne constitue pas une commande et ne peut pas réserver du stock. Une marketplace doit en outre séparer la relation client globale des responsabilités de chaque boutique, sans autoriser un client ou un vendeur à déclarer arbitrairement un paiement ou une expédition.

## Décision

Une commande Yaqeen est composée de :

- un agrégat `orders` appartenant au client ;
- une `shop_orders` par boutique concernée ;
- des `order_items` qui figent titre, variante, SKU, prix et quantité ;
- des `inventory_reservations` limitées dans le temps ;
- des `order_events` append-only pour tracer chaque transition.

La création passe exclusivement par `create_order_reservation`. La fonction :

1. dérive le client de `auth.uid()` ;
2. valide strictement le panier JSON ;
3. sérialise les requêtes d'un même client ;
4. garantit l'idempotence avec un jeton de checkout ;
5. verrouille les variantes dans un ordre déterministe ;
6. refuse boutique, produit, preuve ou variante non publiable ;
7. vérifie le stock disponible puis incrémente `stock_reserved` ;
8. crée atomiquement agrégat, sous-commandes, snapshots, réservations et événements.

Une réservation expire après quinze minutes. Un client peut annuler uniquement sa propre commande `pending_payment`. Le worker `expire_pending_orders`, exécutable uniquement par `service_role`, libère les réservations échues. Les deux chemins journalisent la fermeture de l'agrégat et de chaque sous-commande.

## Frontières de sécurité

- aucune table du domaine commande n'accorde d'écriture directe aux rôles API ;
- le client lit son agrégat et ses sous-commandes ;
- une boutique lit seulement les sous-commandes et lignes qui lui appartiennent, jamais l'agrégat client ;
- l'opérateur dispose d'une lecture transverse ;
- seul le rôle de service peut lancer le worker d'expiration ;
- aucun RPC de paiement, préparation ou expédition n'est exposé dans cet incrément.

Le futur webhook Stripe devra être l'unique autorité capable de passer une commande à `paid`. Cette transition n'est pas simulée avant l'ADR Stripe Connect.

## Invariants

- `stock_reserved` ne dépasse jamais `stock_on_hand` ;
- un rejeu du même jeton ne crée ni nouvelle commande ni double réservation ;
- une variante n'apparaît qu'une fois dans une commande ;
- le total est dérivé des snapshots serveur, jamais d'un prix envoyé par le client ;
- un produit doit être publié par une boutique approuvée et posséder une preuve approuvée ;
- une réservation libérée ou expirée ne peut pas l'être une seconde fois ;
- toute transition autorisée crée un événement d'audit dans la même transaction.

## Limites assumées

- aucune adresse ni option de livraison n'est encore rattachée à la commande ;
- `shipping_cents` et `commission_cents` restent à zéro ;
- aucun paiement n'est initié ;
- aucune interface n'appelle encore la réservation ;
- la planification du worker d'expiration sera configurée avec l'environnement Supabase distant.

Ces limites maintiennent une frontière honnête : le domaine peut être testé sans afficher un checkout fictif.

## Critère de révision

Réviser cet ADR lors de l'adoption de Stripe Connect, du modèle d'adresse figée et des règles de livraison par boutique. Les migrations futures devront conserver les snapshots historiques et étendre les tests d'attaque avant d'exposer une nouvelle transition.
