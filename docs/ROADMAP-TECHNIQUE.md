# Roadmap technique produit

- Référence : état du dépôt au 18 juillet 2026
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
- authentification et compte client partagés avec Expo, avec session chiffrée sur iOS/Android ;
- CI web, mobile et base, avec 485 assertions pgTAP incluant des scénarios d'attaque.
- noyau de commande multi-vendeur avec prix figés, sous-commandes, réservations idempotentes, annulation et expiration auditée.
- Stripe Connect sandbox câblé sur le web : onboarding hébergé, Payment Element, webhook signé et consommation atomique du stock.

La confirmation de livraison, la libération vendeur, le remboursement intégral par sous-commande et le reversal associé sont disponibles en bac à sable avec rapprochement strict. Les retours, remboursements partiels, litiges, payouts et l’activation live restent volontairement indisponibles tant que leur chaîne complète n'est pas fiable.

## Phase 1 — Réaliser une vente de bout en bout

### 1. Domaine commande et stock

État : noyau étendu le 18 juillet 2026. Réservation, adresse figée, expiration et consommation atomique sont opérationnelles. Le Seller Center traite désormais `paid → preparing → shipped`, recalcule l’agrégat multi-boutique et partage le suivi au client sans exposer les autres vendeurs.

- modéliser la commande client, les sous-commandes par boutique et les lignes au prix figé ;
- définir une machine à états fermée pour paiement, préparation, expédition, livraison, annulation et remboursement ;
- réserver le stock atomiquement avec expiration des réservations non payées ;
- appliquer RLS et mutations RPC-only à chaque table ;
- tester les frontières client, vendeur et opérateur avec des scénarios pgTAP d'attaque.

Critère de sortie : aucune lecture inter-boutiques, aucune transition de statut directe et aucun surbooking possible sous concurrence.

### 2. Paiement marketplace

État : pilote web Stripe test étendu le 19 juillet 2026. Le vendeur utilise un Account Link hébergé ; le client réserve puis confirme avec Payment Element ; seuls les webhooks signés appliquent les états financiers asynchrones. Livraison, transfert, remboursement intégral par sous-commande, reversal et protection contre les litiges sont rapprochés en sandbox. Les remboursements partiels et la soumission automatisée des preuves restent fermés.

- documenter Stripe Connect Express dans un nouvel ADR ; `ADR-005` est déjà attribué à la fermeture des écritures catalogue directes ;
- déléguer KYC/KYB, reversements et exigences de paiement à Stripe ;
- choisir et documenter le modèle de charge avant toute implémentation ;
- traiter les webhooks de façon idempotente avec journal persistant ;
- implémenter commissions, remboursements et rapprochement des paiements ;
- ne confirmer une commande qu'à partir d'un événement Stripe authentifié côté serveur.

Critère de sortie : une commande de test payée, ventilée, remboursable et rapprochée sans intervention en base.

### 3. Médias produits

État : socle web/mobile livré le 17 juillet 2026. Le bucket privé, la normalisation WebP, la galerie vendeur, la revue opérateur atomique, les URL signées et le contrat catalogue universel sont opérationnels. Le recadrage, la réorganisation et la rétention automatique des rejets restent ouverts.

- [x] stocker de une à six images par produit avec ordre et texte alternatif ;
- [x] contrôler contenu décodable, type, taille, dimensions et propriétaire côté serveur ;
- [x] soumettre les médias au même workflow de modération que la fiche ;
- [x] normaliser les fichiers produit en WebP et les diffuser par URL signée ;
- [x] convertir le héros actif en AVIF et supprimer les actifs inutilisés ;
- [ ] ajouter recadrage, réorganisation et purge automatique des médias rejetés.

Critère de sortie : aucun produit publiable sans média approuvé, accessible et optimisé.

### 4. Cycle produit et compte client

État compte : carnet d'adresses RPC-only, historique réel, récupération et changement de mot de passe, ainsi que demande de suppression réversible à 30 jours livrés sur le web et Expo le 18 juillet 2026. Sur iOS/Android, la session est conservée dans Keychain/Keystore via SecureStore. La suppression finale reste volontairement réservée à un worker de confiance appliquant la politique de conservation.

- permettre l'édition d'un brouillon et le retour en brouillon après rejet ;
- prendre en charge plusieurs variantes et plusieurs preuves ;
- expirer les preuves arrivées à échéance et retirer automatiquement les produits non conformes ;
- [x] ajouter adresses sécurisées, historique de commandes, récupération de mot de passe et demande de suppression de compte ;
- [ ] automatiser la suppression finale après validation de la politique de conservation et des objets Storage.

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

- [x] partager authentification, compte, adresses et historique de commandes entre Expo et le web ;
- [x] partager la réservation de commande et le checkout test avec iOS/Android via PaymentSheet ;
- [x] isoler les identités development, preview et production et versionner les profils EAS reproductibles ;
- [ ] lier le projet Expo externe, configurer les environnements EAS et produire les premiers binaires internes sur appareils physiques ;
- ajouter les notifications push transactionnelles ;
- valider les exigences App Store et Play Store, puis publier sur les deux stores ;
- instrumenter le funnel réel sans inventer de métriques ;
- construire scorecards vendeurs, Buy Box et mise en avant seulement après les premières ventes observables.

## Ordre d'exécution immédiat

1. pagination, recherche et filtres SQL du catalogue ;
2. édition des fiches, variantes multiples et expiration des preuves ;
3. [x] adaptateur Stripe en mode test, Account Links et handler webhook signé ;
4. [x] checkout web avec réservation, confirmation et consommation atomique du stock ;
5. transferts vendeurs idempotents, politique de libération et rapprochement ;
6. tests E2E des liens Auth web/mobile et configuration des domaines de redirection de production.

## Garde-fous permanents

- aucune donnée fictive présentée comme réelle ;
- aucun secret dans un bundle client ou dans Git ;
- aucune écriture sensible directe lorsque la règle métier exige une RPC ;
- aucun checkout activé sans réservation de stock et webhooks idempotents ;
- aucune donnée interne ou de prospection dans le dépôt public ;
- chaque nouvelle table sensible accompagnée de RLS et de tests d'attaque ;
- chaque phase close par un résultat utilisateur mesurable, pas par une liste de fichiers livrés.
