# Audit technique du prototype — 13 juillet 2026

## Verdict

Le projet possède une direction artistique cohérente et des parcours front-end démontrables. Depuis le 17 juillet, l'identité, le catalogue vendeur, la modération et les storefronts web et mobile reposent sur PostgreSQL ; le paiement multi-vendeurs, la logistique et les images restent à construire.

Cet audit est conservé publiquement pour documenter la dette technique et les corrections. La matrice de pilotage détaillée est tenue dans le dépôt privé Yaqeen.

## État après premières corrections

Depuis le 17 juillet, l'application Expo lit le catalogue public Supabase, partage le contrat de publication du web, expose la preuve revue et borne les quantités au stock annoncé. Les fixtures et le checkout de démonstration ont été supprimés ; commande, paiement et réservation atomique restent volontairement indisponibles.

## Constats critiques

### A-001 — Backend et base de données à rendre opérationnels

- Chantiers : C4, C6, C15, C16
- État : partiel au 15 juillet ; schéma PostgreSQL, migration, RLS, configuration locale, tests pgTAP et CI créés. Exécution distante et sauvegardes non validées.
- Risque : aucune source de vérité, concurrence d'écriture impossible à gérer, données non administrables.
- Sortie attendue : architecture validée, base PostgreSQL, migrations versionnées, API authentifiée, environnements local/staging/production et sauvegardes testées.

### A-002 — Authentification incomplète

- Chantiers : C5, C16
- État : partiel au 18 juillet ; inscription, confirmation e-mail PKCE, connexion, sessions SSR, récupération et changement de mot de passe, carnet d'adresses, historique réel et demande de suppression réversible sont câblés. Le worker de suppression finale, la politique de conservation et les tests E2E restent ouverts.
- Risque : aucune identité client, vendeur ou opérateur ; impossibilité de sécuriser commandes et boutiques.
- Sortie attendue : inscription, connexion, vérification d'adresse, récupération, déconnexion, suppression de compte, rôles et sessions testés.

### A-003 — Checkout et paiement absents

- Chantiers : C9, C10, C12, C16
- État : partiel au 17 juillet ; agrégat client, sous-commandes vendeur, snapshots de prix, réservation atomique, annulation et expiration sont livrés. Le registre Stripe Connect pré-réseau ajoute comptes connectés, tentatives idempotentes, transferts et webhooks dédupliqués. Le checkout simulé reste retiré et aucun rôle client/vendeur ne peut déclarer un paiement.
- Risque : incapacité à encaisser, répartir et rembourser une commande multi-vendeurs.
- Sortie attendue : décision Stripe Connect documentée, comptes connectés, ventilation par vendeur, webhooks idempotents, remboursements et reversements testés.

### A-004 — Seller Center non opérationnel

- Chantiers : C11, C17
- État : partiel au 15 juillet ; création de boutique transactionnelle, rôle vendeur, tableau de bord, liste catalogue et création atomique produit/variante/stock/preuve sont persistés. Édition, commandes et expédition restent ouverts.
- Sortie attendue : onboarding entreprise, création de boutique, catalogue, variantes, stock, commandes, expédition et retours utilisables sans intervention technique.

### A-005 — La confiance halal n'est pas un objet métier

- Chantiers : C2, C6, C7, C13
- État : partiellement traité ; modèle serveur, soumission, revue opérateur et affichage public détaillé livrés. Pièces binaires, expiration, révocation et doctrine par catégorie restent ouverts.
- Sortie attendue : modèle de preuve versionné distinguant déclaration vendeur, contrôle documentaire, certificat tiers et analyse ; organisme, numéro, dates, périmètre, document et décision de modération visibles sur la fiche.

## Incohérences fonctionnelles

- A-018 — auto-publication et auto-approbation par insert PostgREST direct : corrigé le 15 juillet ; grants et policies de mutation directe retirés sur produits, variantes et preuves, avec trois tests pgTAP reproduisant les attaques. Voir ADR-005.
- A-019 — aucun chemin légitime vers `published` : corrigé le 15 juillet ; soumission boutique/produit, décisions opérateur, approbation atomique de la preuve et journal d'audit livrés. Voir ADR-006.
- A-020 — storefront déconnecté de PostgreSQL : corrigé le 15 juillet ; home, catalogue et fiche utilisent uniquement les produits publiés avec boutique et preuve approuvées. Fixtures web supprimées. Voir ADR-007.

- A-006 — compteur panier de la home web : corrigé le 15 juillet, lien et quantité utilisent le `CartProvider` partagé.
- A-007 — produits dupliqués : corrigé le 17 juillet ; les sources statiques web et Expo sont supprimées et les deux clients appliquent le même contrat Supabase. Voir ADR-007 et ADR-008.
- A-008 — contrôles décoratifs sans action : C8, C11, C13 ; navigation Seller non disponible rendue explicitement inactive et menu mobile câblé. Audit web global restant.
- A-009 — frais de port calculés au panier global : calcul fictif retiré du web ; règles et seuils persistés par vendeur restent ouverts.
- A-010 — stock absent et quantités illimitées : C6, C9, partiel ; stock affiché et quantités bornées côté clients, réservation atomique idempotente et libération à l'annulation/expiration livrées. La consommation de réservation après webhook de paiement reste ouverte.

## Qualité, performance et accessibilité

- A-011 — médias lourds et actifs inutilisés : C14, traité pour le héros et les produits ; héros actif réduit d’environ 2,7 Mio à environ 146 Kio en AVIF, actif botanique et SVG par défaut supprimés, médias vendeur normalisés en WebP borné.
- A-012 — textes inférieurs à 11–12 px : C18, ouvert ; audit WCAG et échelle typographique accessible.
- A-013 — favoris, étoiles et contrôles non sémantiques : partiel ; favoris et avis fictifs retirés du storefront, audit clavier et lecteur d'écran restant.
- A-014 — feuille CSS monolithique : C4, ouvert ; styles découpés par surface ou composant.
- A-015 — absence de tests et de CI : C4, C16, partiellement traité ; CI distante web/mobile/base active et verte. La protection de branche et les tests E2E restent requis.
- A-016 — SEO incomplet : C14, partiel ; métadonnées dynamiques, canonical, OpenGraph et données structurées Product livrés. Sitemap, robots public et images sociales restent ouverts.
- A-017 — dépendance transitive PostCSS : sous surveillance au 15 juillet ; `npm audit` signale deux vulnérabilités modérées via Next.js 16.2.10. Aucun risque élevé/critique. Le correctif automatique proposé rétrograde vers Next.js 9 et ne doit pas être appliqué ; mise à niveau dès publication d'une version Next.js corrigée compatible.

## Ordre de traitement recommandé

1. C9/C10/C12 : commande multi-vendeurs, réservation de stock, paiement et livraison.
2. C6/C11 : médias produits, édition du catalogue et expiration des preuves.
3. C5 : finalisation de la suppression après conservation et partage du compte avec Expo.
4. C14/C16/C18 : recherche paginée, SEO, sécurité, performance et accessibilité.
5. C13 : avis vérifiés, pages boutiques, retours et matérialisation publique de la confiance.

Les commandes et paiements doivent rester explicitement désactivés jusqu'à leur branchement réel. Aucun chiffre commercial, avis, frais de livraison ou garantie de paiement ne doit être simulé.

La séquence à jour et ses critères de sortie sont maintenus dans `docs/ROADMAP-TECHNIQUE.md`.
