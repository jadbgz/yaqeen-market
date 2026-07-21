# ADR-018 — Cycle de vie éditable du catalogue vendeur

- Statut : accepté
- Date : 21 juillet 2026
- Portée : Seller Center, catalogue, preuves, recherche, checkout

## Décision

Un produit vendeur n'est modifiable que dans les états `draft` et `rejected`. Les mutations restent RPC-only et expriment chacune une intention métier : corriger le contenu, enregistrer une variante, désactiver une variante, soumettre une preuve ou retirer une preuve encore en attente. Une correction après refus remet le produit en `draft`; aucune mise à jour silencieuse d'un produit publié ou en revue n'est autorisée.

La fiche peut posséder plusieurs variantes et plusieurs preuves. Une variante déjà référencée n'est pas supprimée : elle est désactivée, et son stock physique ne peut pas passer sous le stock réservé. Les preuves déjà décidées restent dans l'historique; seule une soumission `pending` peut être retirée avant revue.

## Primitive de confiance

La base définit une preuve actuelle comme une preuve :

- `approved`;
- accompagnée d'un résumé public suffisamment précis;
- dont `valid_from` est absent ou passé;
- dont `valid_until` est absent ou non dépassé.

`is_product_publicly_listed(product_id)` est la décision centrale utilisée par la RLS, les variantes, les preuves et les médias privés. La recherche SQL réapplique explicitement cette primitive, y compris pour une session vendeur qui peut lire ses propres brouillons. La réservation conserve ses propres critères transactionnels (boutique et produit publiés, variante active) mais consomme le même `has_current_approved_evidence(product_id)` afin qu'une preuve expirée soit refusée au checkout.

L'expiration retire donc immédiatement le produit de toute lecture publique et du checkout, même avant le passage du worker de maintenance. `expire_due_product_evidence()` persiste ensuite l'état `expired` et remet à corriger les produits publiés qui n'ont plus aucune preuve actuelle. Cette fonction est réservée à `service_role`, `operator` et `admin` et doit être planifiée quotidiennement sur l'environnement hébergé.

## Modération

La file opérateur affiche toutes les variantes actives et toutes les preuves en attente. L'opérateur choisit explicitement la preuve portée par sa décision. L'approbation revalide ses dates dans la transaction : une preuve future ou arrivée à échéance ne peut pas publier le produit.

## Vérification

La suite `catalog_lifecycle.test.sql` couvre les privilèges, l'IDOR inter-boutiques, le verrouillage des publications, le stock réservé, les preuves multiples, la non-auto-approbation, les dates futures et expirées, la RLS anonyme, la recherche, la réservation et l'idempotence du worker d'expiration.

## Limites assumées

- Le worker doit encore être planifié dans le projet Supabase hébergé; la sécurité publique n'en dépend pas.
- Une modification commerciale d'un produit déjà publié devra passer par un futur modèle de révision versionnée, au lieu de modifier la publication en place.
- Les documents binaires de preuve nécessitent leur propre bucket privé et leur politique de rétention.
