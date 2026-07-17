# Audit technique du prototype — 13 juillet 2026

## Verdict

Le projet possède une direction artistique cohérente et des parcours front-end démontrables. Depuis le 15 juillet, l'identité, le catalogue vendeur, la modération et le storefront web reposent sur PostgreSQL ; le paiement multi-vendeurs, la logistique, les images et la convergence mobile restent à construire.

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
- État : partiel au 15 juillet ; inscription, confirmation e-mail PKCE, connexion, sessions SSR, espace compte protégé et déconnexion câblés. Récupération, suppression, rôles et tests E2E restent ouverts.
- Risque : aucune identité client, vendeur ou opérateur ; impossibilité de sécuriser commandes et boutiques.
- Sortie attendue : inscription, connexion, vérification d'adresse, récupération, déconnexion, suppression de compte, rôles et sessions testés.

### A-003 — Checkout et paiement absents

- Chantiers : C9, C10, C12, C16
- État : ouvert ; le checkout simulé mobile a été retiré le 17 juillet afin de ne pas créer une fausse capacité de commande.
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
- A-010 — stock absent et quantités illimitées : C6, C9, partiel ; stock disponible affiché et quantité bornée sur les clients web et mobile, réservation atomique et revalidation serveur au checkout restent ouvertes.

## Qualité, performance et accessibilité

- A-011 — médias lourds et actifs inutilisés : C14, ouvert ; budget d'image, AVIF/WebP et nettoyage des actifs.
- A-012 — textes inférieurs à 11–12 px : C18, ouvert ; audit WCAG et échelle typographique accessible.
- A-013 — favoris, étoiles et contrôles non sémantiques : partiel ; favoris et avis fictifs retirés du storefront, audit clavier et lecteur d'écran restant.
- A-014 — feuille CSS monolithique : C4, ouvert ; styles découpés par surface ou composant.
- A-015 — absence de tests et de CI : C4, C16, partiellement traité ; workflow web/mobile créé, premier run distant et protection de branche encore requis.
- A-016 — SEO incomplet : C14, partiel ; métadonnées dynamiques, canonical, OpenGraph et données structurées Product livrés. Sitemap, robots public et images sociales restent ouverts.
- A-017 — dépendance transitive PostCSS : sous surveillance au 15 juillet ; `npm audit` signale deux vulnérabilités modérées via Next.js 16.2.10. Aucun risque élevé/critique. Le correctif automatique proposé rétrograde vers Next.js 9 et ne doit pas être appliqué ; mise à niveau dès publication d'une version Next.js corrigée compatible.

## Ordre de traitement recommandé

1. C4 : socle, CI et choix de la source de vérité.
2. C5/C6 : identités, rôles, catalogue, stock et modèle de preuve.
3. C11/C7 : Seller Center et back-office de modération.
4. C9/C10/C12 : commande multi-vendeurs, livraison et paiement.
5. C13/C14/C16/C18 : confiance, SEO, sécurité, performance et accessibilité avant ouverture.

Les commandes et paiements doivent rester explicitement désactivés jusqu'à leur branchement réel. Aucun chiffre commercial, avis, frais de livraison ou garantie de paiement ne doit être simulé.
