# ADR-005 — Écritures catalogue exclusivement transactionnelles

- Statut : accepté après audit de sécurité
- Date : 2026-07-15
- Portée : C6, C7, C11, C16

## Incident évité

Les premières migrations limitaient la mise à jour des colonnes sensibles, mais accordaient encore l'insertion directe des tables `products` et `product_evidence` au rôle `authenticated`. Un membre de boutique pouvait donc contourner l'interface et la fonction contrôlée en appelant PostgREST directement avec `status = 'published'` ou `status = 'approved'`.

La RLS vérifiait l'appartenance à la boutique, pas la légitimité du statut demandé. La frontière de confiance annoncée par l'interface n'était donc pas garantie par PostgreSQL.

## Décision

Les clients authentifiés conservent la lecture RLS mais ne disposent plus d'aucun droit direct d'insertion, modification ou suppression sur :

- `products` ;
- `product_variants` ;
- `product_evidence`.

Toutes les mutations catalogue passent par une fonction PostgreSQL `security definer` dédiée, avec `search_path` verrouillé, identité dérivée de `auth.uid()`, autorisation sur la ressource et états imposés côté base.

Cette règle couvre aussi les variantes : laisser leur écriture directe ouverte permettrait de modifier un prix ou un stock après la revue du produit.

## Tests de non-régression

La suite pgTAP reproduit désormais trois appels équivalents à des requêtes PostgREST hostiles :

1. insertion directe d'un produit déjà `published` ;
2. insertion directe d'une preuve déjà `approved` et auto-révisée ;
3. ajout direct d'une variante avec prix et stock non revus.

Les trois opérations doivent échouer avec `42501 permission denied`, tandis que `create_product_draft` doit continuer à créer atomiquement un brouillon complet.

## Conséquence

Les futures fonctions d'édition, de soumission, de revue, d'archivage et de stock devront chacune exposer une intention métier précise. Aucun grant générique de mutation catalogue ne pourra être réintroduit.
