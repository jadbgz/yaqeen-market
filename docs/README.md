# Pilotage Yaqeen Market

Ce dossier transforme le Plan Directeur v1.0 et le Playbook des 22 chantiers en système d'exécution.

## Documents de référence

- `PROGRAMME.md` : séquence, dépendances, gates et état des chantiers.
- `DECISIONS.md` : décisions actées, hypothèses et questions ouvertes.
- `BUSINESS-MODEL.md` : hypothèses économiques et protocole de validation.
- `audits/AUDIT-TECHNIQUE-2026-07-13.md` : dette produit et critères de remédiation issus de l'audit technique.
- `architecture/ADR-002-backend-supabase-postgres.md` : décision du socle PostgreSQL, Auth, migrations et RLS.
- `architecture/ADR-003-secure-seller-onboarding.md` : frontière transactionnelle de création d'une boutique vendeur.
- `architecture/ADR-004-atomic-product-draft.md` : création atomique du produit, de sa variante, de son stock et de sa preuve.
- `architecture/ADR-005-rpc-only-catalog-writes.md` : fermeture des contournements PostgREST et écritures catalogue exclusivement par RPC.
- `../ops/audits/technical-findings.csv` : registre exécutable des constats, priorités, chantiers et critères de sortie.
- `chantiers/C1-validation-marche.md` : acquisition vendeurs et validation acheteurs.
- `chantiers/C2-charte-et-moderation.md` : cadre religieux et preuves produit.
- `chantiers/C3-juridique-et-conformite.md` : structure et conformité.

## Règle de pilotage

Aucun chantier ne démarre parce que sa maquette existe. Il démarre lorsque ses prérequis sont satisfaits, son périmètre relu, son responsable nommé et sa Definition of Done mesurable.

Le code actuel est un prototype de découverte. Il ne constitue ni une preuve de marché, ni un backend marketplace, ni une plateforme juridiquement exploitable.
