# ADR-014 — Confirmation de livraison et libération vendeur

- Statut : accepté et implémenté en bac à sable
- Date : 2026-07-18
- Portée : preuve opérateur, éligibilité et transfert Stripe Connect

## Décision

Une boutique ne peut jamais s’auto-déclarer livrée. Une sous-commande `shipped` devient `delivered` uniquement par une frontière opérateur qui exige une justification et crée une preuve immuable séparée de l’événement métier.

Le transfert vendeur est libéré sous-commande par sous-commande. Il exige : livraison confirmée, paiement Stripe réussi avec charge rapprochée, compte connecté encore actif et montant positif. Le net transféré est recalculé depuis les montants figés en base : `total_cents - commission_cents`.

## Protocole financier

PostgreSQL prépare d’abord un unique `payment_transfer` et sa clé d’idempotence. Le serveur crée ensuite un transfert Stripe lié à la charge avec `source_transaction`. Le ledger ne devient `submitted` qu’après comparaison de l’identifiant Stripe, du montant, de la devise et du compte destinataire.

Une erreur fournisseur est réduite à un code technique sûr ; le message brut n’entre pas dans la base. Un résultat réseau ambigu reste réconciliable avec la même clé d’idempotence. Aucun client authentifié ne peut appeler les RPC financières ou écrire directement dans le ledger.

## Limites assumées

Le flux reste exclusivement activable avec des clés Stripe test. Le passage live, le délai contractuel de libération, les remboursements, les reversals, les litiges et le rapprochement avec les payouts demeurent fermés jusqu’à validation juridique, financière et opérationnelle.

## Références vérifiées

- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/api/transfers/create
- https://docs.stripe.com/api/idempotent_requests
