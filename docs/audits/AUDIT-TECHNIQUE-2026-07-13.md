# Audit technique du prototype — 13 juillet 2026

## Verdict

Le projet possède une direction artistique cohérente et des parcours front-end démontrables, mais il reste un prototype à données simulées. Les fondations d'une marketplace exploitable — persistance serveur, identité, catalogue administrable, paiement multi-vendeurs, logistique et preuve de conformité — ne sont pas encore construites.

Cet audit devient une entrée formelle du programme. La matrice opérationnelle correspondante est tenue dans `ops/audits/technical-findings.csv`.

## État après premières corrections

Certains constats de l'audit initial ont déjà été traités dans l'application mobile Expo : recherche interactive, fiches produit navigables, favoris locaux, quantités, suppression, panier regroupé par boutique, checkout de démonstration, navigation compte/panier et affichage de contrôles produit. Ces corrections restent locales au prototype et ne remplacent ni une API, ni une base de données, ni une preuve réglementaire réelle.

## Constats critiques

### A-001 — Absence de backend et de base de données

- Chantiers : C4, C6, C15, C16
- État : ouvert
- Risque : aucune source de vérité, concurrence d'écriture impossible à gérer, données non administrables.
- Sortie attendue : architecture validée, base PostgreSQL, migrations versionnées, API authentifiée, environnements local/staging/production et sauvegardes testées.

### A-002 — Authentification factice

- Chantiers : C5, C16
- État : ouvert
- Risque : aucune identité client, vendeur ou opérateur ; impossibilité de sécuriser commandes et boutiques.
- Sortie attendue : inscription, connexion, vérification d'adresse, récupération, déconnexion, suppression de compte, rôles et sessions testés.

### A-003 — Checkout et paiement absents

- Chantiers : C9, C10, C12, C16
- État : ouvert ; checkout simulé disponible sur mobile.
- Risque : incapacité à encaisser, répartir et rembourser une commande multi-vendeurs.
- Sortie attendue : décision Stripe Connect documentée, comptes connectés, ventilation par vendeur, webhooks idempotents, remboursements et reversements testés.

### A-004 — Seller Center non opérationnel

- Chantiers : C11, C17
- État : ouvert ; interface de démonstration seulement.
- Sortie attendue : onboarding entreprise, création de boutique, catalogue, variantes, stock, commandes, expédition et retours utilisables sans intervention technique.

### A-005 — La confiance halal n'est pas un objet métier

- Chantiers : C2, C6, C7, C13
- État : partiellement traité dans l'UI mobile, modèle serveur absent.
- Sortie attendue : modèle de preuve versionné distinguant déclaration vendeur, contrôle documentaire, certificat tiers et analyse ; organisme, numéro, dates, périmètre, document et décision de modération visibles sur la fiche.

## Incohérences fonctionnelles

- A-006 — compteur panier de la home web non connecté : C9, ouvert ; remplacer le bouton statique par le composant panier partagé.
- A-007 — produits dupliqués entre la home et la source catalogue : C6, ouvert ; une seule source de vérité.
- A-008 — contrôles décoratifs sans action : C8, C11, C13 ; partiellement corrigé sur mobile, audit complet web/Seller Center restant.
- A-009 — frais de port calculés au panier global : C9, C12, ouvert ; règles et seuils par vendeur.
- A-010 — stock absent et quantités illimitées : C6, C9, ouvert ; stock disponible, réservé, vendu et politique de survente.

## Qualité, performance et accessibilité

- A-011 — médias lourds et actifs inutilisés : C14, ouvert ; budget d'image, AVIF/WebP et nettoyage des actifs.
- A-012 — textes inférieurs à 11–12 px : C18, ouvert ; audit WCAG et échelle typographique accessible.
- A-013 — favoris, étoiles et contrôles non sémantiques : C13, C18, ouvert ; clavier, lecteur d'écran et valeurs réelles.
- A-014 — feuille CSS monolithique : C4, ouvert ; styles découpés par surface ou composant.
- A-015 — absence de tests et de CI : C4, C16, partiellement traité ; workflow web/mobile créé, premier run distant et protection de branche encore requis.
- A-016 — SEO incomplet : C14, ouvert ; sitemap, robots, métadonnées dynamiques, OpenGraph et données structurées Product.

## Ordre de traitement recommandé

1. C4 : socle, CI et choix de la source de vérité.
2. C5/C6 : identités, rôles, catalogue, stock et modèle de preuve.
3. C11/C7 : Seller Center et back-office de modération.
4. C9/C10/C12 : commande multi-vendeurs, livraison et paiement.
5. C13/C14/C16/C18 : confiance, SEO, sécurité, performance et accessibilité avant ouverture.

Le prototype doit continuer d'afficher explicitement que ses produits, chiffres, avis et contrôles sont simulés jusqu'au branchement de données vérifiées.
