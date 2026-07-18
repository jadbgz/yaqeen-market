# ADR-016 — Litiges Stripe et récupération vendeur

Statut : accepté pour le pilote Stripe test, 19 juillet 2026.

## Décision

Yaqeen est le marchand de référence pour les paiements plateforme utilisant des charges et transferts séparés. Un litige débite donc le solde de la plateforme, même si le net vendeur a déjà été transféré. Les litiges deviennent un objet financier de premier rang, distinct des remboursements.

Le webhook signé récupère systématiquement l'objet `Dispute` courant avant de rapprocher son identifiant, la charge source, la devise, le montant, le statut et les informations de preuve. Les événements sont dédupliqués dans le journal Stripe puis reliés à un journal spécialisé immuable.

## Frontières financières

- `charge.dispute.created`, `updated` et `closed` synchronisent le dossier et gèlent les nouveaux transferts tant que l'exposition n'est pas résolue.
- Une enquête `warning_*` ne prétend jamais que de l'argent a été retiré.
- Seul `charge.dispute.funds_withdrawn` autorise une récupération financière.
- Seul `charge.dispute.funds_reinstated` prouve le retour des fonds à la plateforme.
- Un litige égal au montant intégral de la charge permet de reverser automatiquement chaque net vendeur déjà libéré.
- Un litige partiel sur un panier multi-vendeur reste en `manual_partial` : aucune boutique n'est débitée arbitrairement.
- Après rétablissement des fonds, chaque reversal déjà exécuté devient `compensation_required`. Aucun nouveau transfert vendeur n'est envoyé automatiquement sans rapprochement opérateur.

## Invariants

- clients et vendeurs ne peuvent ni créer ni modifier les litiges ou récupérations ;
- chaque identité Stripe est immutable et rapprochée avec la charge locale réussie ;
- la devise locale doit correspondre à Stripe ;
- une récupération ne peut excéder le net vendeur exact et ne touche jamais la commission Yaqeen ;
- un transfert déjà récupéré par un remboursement n'est pas récupéré une seconde fois ;
- préparation et exécution des reversals sont idempotentes ;
- un litige perdu continue de bloquer la libération des fonds non versés.

## Limites assumées

Le pilote n'envoie pas encore les pièces de contestation à l'API Stripe et n'exécute pas automatiquement les recompensations après une victoire. Ces deux actions demandent une politique documentaire, contractuelle et comptable validée. L'interface opérateur expose déjà l'échéance, le statut des preuves et les obligations de reprise.

## Sources

- https://docs.stripe.com/connect/charges
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/disputes/api
- https://docs.stripe.com/api/events/types
