# ADR-004 — Brouillon produit atomique et preuve obligatoire

- Statut : accepté pour le premier catalogue vendeur
- Date : 2026-07-15
- Portée : C2, C6, C7, C11, C16

## Décision

La première création d'un produit est une transaction PostgreSQL unique. Elle crée ensemble :

1. le produit avec le statut `draft` ;
2. sa première variante et son prix entier en centimes ;
3. son stock physique, avec un stock réservé initial nul ;
4. une première preuve au statut `pending`, attribuée au compte qui la soumet.

Si une validation, une contrainte d'unicité ou une autorisation échoue, aucun de ces objets n'est conservé.

## Frontière de sécurité

La fonction `create_product_draft` :

- exige une session authentifiée et une adhésion à la boutique ciblée ;
- dérive toujours le soumetteur depuis `auth.uid()` ;
- impose le statut produit `draft` et le statut preuve `pending` ;
- n'est pas exécutable par le rôle anonyme ;
- revalide les formats, bornes de prix et de stock et catégories côté base ;
- exige l'organisme et la référence lorsqu'un vendeur déclare un certificat tiers.

Le navigateur ne transmet pas le statut et l'action serveur déduit la boutique depuis la session. Les droits SQL existants empêchent toujours le vendeur de publier son produit ou d'approuver sa propre preuve.

## Sémantique de confiance

Une déclaration vendeur et un certificat tiers sont deux natures distinctes. Le dépôt d'une pièce n'autorise aucune allégation publique : la modération doit encore vérifier son périmètre, son émetteur et son contenu avant publication.

Les contrôles documentaire interne et analyse de laboratoire restent réservés aux futurs workflows opérateur ; ils ne sont pas sélectionnables par le vendeur.

## Limites de cet incrément

- une seule variante est créée initialement ; l'édition et l'ajout de variantes suivent ;
- le document binaire n'est pas encore téléversé dans un stockage privé ;
- le passage `draft` → `under_review` et la décision opérateur restent à construire ;
- la taxonomie de sept catégories est un contrat initial à versionner avant ouverture commerciale.

## Contrôles

La CI vérifie l'exécution atomique, les états imposés, le prix et le stock persistés, l'attribution de la preuve et le refus d'un utilisateur extérieur à la boutique.
