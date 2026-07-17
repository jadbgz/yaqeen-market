# Roadmap technique produit

- Référence : état du dépôt au 17 juillet 2026, commit `48cbb12`
- Portée : web Next.js, application Expo, Supabase/PostgreSQL, sécurité et exploitation
- Objectif : passer d'un socle marketplace fiable à une première commande réelle livrée

Cette roadmap publique reprend uniquement les priorités techniques partageables. Les analyses de sécurité détaillées, hypothèses commerciales, données de prospection et documents de travail internes restent hors du dépôt public.

## Socle acquis

- authentification Supabase avec sessions SSR et confirmation PKCE ;
- onboarding vendeur et création atomique d'un brouillon produit ;
- catalogue, variantes, stock et preuves persistés dans PostgreSQL ;
- écritures sensibles exclusivement par RPC métier ;
- workflow vendeur/opérateur avec décisions de modération tracées ;
- storefront web et mobile alimenté par le même catalogue public audité ;
- CI web, mobile et base, avec 77 assertions pgTAP incluant des scénarios d'attaque.

Le paiement, la commande et la livraison restent volontairement indisponibles tant que leur chaîne complète n'est pas fiable.

## Phase 1 — Réaliser une vente de bout en bout

### 1. Domaine commande et stock

- modéliser la commande client, les sous-commandes par boutique et les lignes au prix figé ;
- définir une machine à états fermée pour paiement, préparation, expédition, livraison, annulation et remboursement ;
- réserver le stock atomiquement avec expiration des réservations non payées ;
- appliquer RLS et mutations RPC-only à chaque table ;
- tester les frontières client, vendeur et opérateur avec des scénarios pgTAP d'attaque.

Critère de sortie : aucune lecture inter-boutiques, aucune transition de statut directe et aucun surbooking possible sous concurrence.

### 2. Paiement marketplace

- documenter Stripe Connect Express dans un nouvel ADR ; `ADR-005` est déjà attribué à la fermeture des écritures catalogue directes ;
- déléguer KYC/KYB, reversements et exigences de paiement à Stripe ;
- choisir et documenter le modèle de charge avant toute implémentation ;
- traiter les webhooks de façon idempotente avec journal persistant ;
- implémenter commissions, remboursements et rapprochement des paiements ;
- ne confirmer une commande qu'à partir d'un événement Stripe authentifié côté serveur.

Critère de sortie : une commande de test payée, ventilée, remboursable et rapprochée sans intervention en base.

### 3. Médias produits

- stocker de une à six images par produit avec ordre et texte alternatif ;
- contrôler type, taille, dimensions et propriétaire côté serveur ;
- soumettre les médias au même workflow de modération que la fiche ;
- générer des formats responsive AVIF/WebP ;
- convertir le héros actif et supprimer les actifs inutilisés.

Critère de sortie : aucun produit publiable sans média approuvé, accessible et optimisé.

### 4. Cycle produit et compte client

- permettre l'édition d'un brouillon et le retour en brouillon après rejet ;
- prendre en charge plusieurs variantes et plusieurs preuves ;
- expirer les preuves arrivées à échéance et retirer automatiquement les produits non conformes ;
- ajouter adresses sécurisées, historique de commandes, récupération de mot de passe et suppression de compte.

### Sortie de phase

Une vraie commande doit pouvoir être payée, préparée par un vendeur, expédiée, livrée et remboursée, avec commission Yaqeen et journal d'audit. Tous les produits publiés disposent d'images approuvées.

## Phase 2 — Atteindre le standard perçu d'une grande marketplace

### Recherche et navigation

- déplacer pagination, tri et filtres dans PostgreSQL ;
- ajouter recherche plein texte française, `unaccent` et `pg_trgm` ;
- proposer des facettes catégorie, prix, boutique et niveau de preuve ;
- n'introduire Typesense ou Meilisearch qu'après mesure d'un besoin réel autour de plusieurs milliers de SKU.

### Performance et SEO

- mettre en place cache et revalidation ciblée après modération ;
- utiliser des images responsive et imposer des budgets de poids ;
- viser LCP inférieur à 2 s sur mobile, CLS inférieur à 0,1 et Lighthouse supérieur ou égal à 90 ;
- compléter sitemap, robots, pages boutiques et catégories, métadonnées sociales et données structurées.

### Confiance, livraison et retours

- n'autoriser les avis qu'après une commande livrée ;
- publier une page boutique et une explication claire des niveaux de preuve ;
- calculer transport, seuils et délais par boutique ;
- exiger un suivi avant la transition vers `shipped` ;
- construire rétractation, retour, litige et remboursement avec traces auditables.

## Phase 3 — Durcissement et conformité

Cette phase commence avant l'ouverture publique et avance en parallèle de la phase 2.

1. headers de sécurité et politique CSP testée sans casser Next.js ni les paiements ;
2. limitation de débit et protection anti-bot sur authentification, écritures et checkout ;
3. MFA obligatoire pour les rôles opérateur et administrateur ;
4. monitoring front/serveur et alertes sur les webhooks ;
5. staging isolé, sauvegardes et restauration effectivement testée ;
6. tests E2E du parcours complet et tests d'attaque continus ;
7. pentest externe avant ouverture publique.

Les sujets RGPD, P2B, DSA, CGV, fiscalité, facturation et médiation doivent être validés avec des professionnels compétents. Le code seul ne constitue pas une validation juridique.

## Phase 4 — Distribution mobile et passage à l'échelle

- partager authentification, panier, commandes et checkout entre Expo et le web ;
- ajouter les notifications push transactionnelles ;
- valider les exigences App Store et Play Store, puis publier sur les deux stores ;
- instrumenter le funnel réel sans inventer de métriques ;
- construire scorecards vendeurs, Buy Box et mise en avant seulement après les premières ventes observables.

## Ordre d'exécution immédiat

1. schéma de commande, machine à états, RLS et tests d'attaque ;
2. décision Stripe Connect dans un ADR dédié ;
3. médias produits et leur modération ;
4. récupération de mot de passe et premier lot de durcissement ;
5. pagination et filtres SQL du catalogue.

## Garde-fous permanents

- aucune donnée fictive présentée comme réelle ;
- aucun secret dans un bundle client ou dans Git ;
- aucune écriture sensible directe lorsque la règle métier exige une RPC ;
- aucun checkout activé sans réservation de stock et webhooks idempotents ;
- aucune donnée interne ou de prospection dans le dépôt public ;
- chaque nouvelle table sensible accompagnée de RLS et de tests d'attaque ;
- chaque phase close par un résultat utilisateur mesurable, pas par une liste de fichiers livrés.
