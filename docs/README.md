# Documentation technique publique

Les informations commerciales, le pipeline de prospection, les hypothèses de prix et le pilotage interne vivent dans le dépôt privé Yaqeen. Ce dossier public contient uniquement les décisions d'architecture et les constats techniques utiles à l'audit du code.

## Documents de référence

- `ROADMAP-TECHNIQUE.md` : séquence publique expurgée vers une première commande réelle, puis le niveau de service d'une grande marketplace.
- `audits/AUDIT-TECHNIQUE-2026-07-13.md` : dette produit et critères de remédiation issus de l'audit technique.
- `architecture/ADR-007-public-catalog-read-model.md` : source de vérité et critères d'affichage du storefront public.
- `architecture/ADR-008-universal-public-catalog.md` : convergence Expo iOS/Android/web vers le même catalogue public.
- `architecture/ADR-009-secure-order-reservations.md` : agrégat client, sous-commandes vendeur, snapshots et réservation atomique du stock.
- `architecture/ADR-010-stripe-connect-funds-flow.md` : comptes connectés, paiement plateforme, transferts séparés, webhooks et responsabilité financière.
- `architecture/ADR-001-surfaces-web-mobile.md` : répartition des responsabilités entre web, mobile, Seller Center et back-office.
- `architecture/ADR-002-backend-supabase-postgres.md` : décision du socle PostgreSQL, Auth, migrations et RLS.
- `architecture/ADR-003-secure-seller-onboarding.md` : frontière transactionnelle de création d'une boutique vendeur.
- `architecture/ADR-004-atomic-product-draft.md` : création atomique du produit, de sa variante, de son stock et de sa preuve.
- `architecture/ADR-005-rpc-only-catalog-writes.md` : fermeture des contournements PostgREST et écritures catalogue exclusivement par RPC.
- `architecture/ADR-006-moderation-state-machine.md` : transitions vendeur/opérateur, publication atomique et journal des décisions.

Les ADR décrivent l'état du système au moment de leur adoption. Ils ne constituent ni une promesse commerciale ni une certification de conformité.
