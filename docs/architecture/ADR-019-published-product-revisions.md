# ADR-019 — Révisions isolées des produits publiés

- Statut : accepté
- Date : 22 juillet 2026
- Portée : Seller Center, modération, catalogue, variantes et inventaire

## Contexte

Un produit publié ne peut pas être modifié en place : cela permettrait à un vendeur de remplacer un contenu approuvé sans nouvelle décision. Le remettre en brouillon à chaque correction interromprait toutefois la vente, dégraderait le référencement et rendrait les petites évolutions commerciales impraticables.

## Décision

Toute évolution éditoriale d'un produit publié passe par un instantané privé `product_revisions`. Cet instantané copie la fiche et la totalité de ses variantes. Il reste invisible aux clients, puis est soumis à une file de comparaison opérateur. Une seule révision active (`draft`, `under_review` ou `rejected`) est autorisée par produit.

L'approbation applique la fiche et toutes les variantes dans une transaction PostgreSQL unique. Les variantes existantes conservent leur UUID afin de ne pas casser les paniers, commandes et journaux historiques. Les permutations de SKU utilisent brièvement un espace réservé que les validateurs vendeurs ne peuvent pas produire. Une collision, une preuve échue, une boutique non approuvée ou une version de base modifiée annule l'intégralité de la transaction.

Les écritures directes sont révoquées. Les vendeurs ne peuvent lire et muter que les révisions de leur boutique via des RPC `security definer`; l'opérateur est le seul rôle capable d'approuver ou de refuser. Chaque décision est ajoutée au journal de modération.

## Séparation de l'inventaire vivant

Le stock n'est pas une donnée éditoriale versionnée. Une réservation ou un paiement peut le modifier pendant les heures ou jours de revue. Réappliquer le stock capturé dans l'instantané provoquerait alors une perte de mise à jour et pourrait recréer des unités vendues.

Pour une variante déjà publiée, la révision conserve le stock à titre de contexte mais ne peut ni le changer ni le réappliquer. `set_published_variant_inventory` est la frontière opérationnelle dédiée : elle verrouille la variante, vérifie l'appartenance à la boutique et refuse toute quantité inférieure au stock réservé. Une nouvelle variante garde un stock initial, appliqué uniquement lors de sa création après approbation.

## Concurrence et invariants

- `base_product_updated_at` fournit un verrou optimiste sur la version éditoriale comparée.
- La version publique reste lisible, réservable et achetable pendant la préparation et la revue.
- Une révision sous revue est immuable côté vendeur.
- Une approbation ne peut jamais écraser le stock opérationnel le plus récent.
- Un refus ne modifie aucune donnée publique; sa correction resynchronise explicitement la base éditoriale.
- Une preuve approuvée et actuellement valide est revérifiée à la soumission puis à l'approbation.

## Vérification

`product_revisions.test.sql` couvre la RLS, les privilèges, l'IDOR inter-boutiques, l'idempotence, l'unicité de la révision active, le verrouillage sous revue, l'auto-approbation, les permutations de SKU, les UUID stables, l'application atomique, l'obsolescence optimiste, l'expiration des preuves et la préservation du stock modifié pendant une revue.

## Conséquences

Cette architecture augmente le nombre de tables et la taille de la file de modération, mais elle sépare clairement trois responsabilités : publication publique, proposition éditoriale et inventaire opérationnel. Les documents binaires de preuve restent un chantier distinct avec leur propre bucket privé, contrôle d'accès, rétention et journal d'accès.
