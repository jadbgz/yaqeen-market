# ADR-006 — Machine d'états de modération

- Statut : accepté
- Date : 2026-07-15
- Portée : catalogue, confiance, opérations

## Décision

La publication n'est pas une mise à jour générique. Elle résulte d'une suite de transitions PostgreSQL explicites :

```text
boutique draft/rejected → under_review → approved/rejected
produit draft → under_review → published/rejected
preuve pending → approved/rejected
```

Le vendeur peut soumettre une boutique complète puis un produit complet. Seul un profil `operator` ou `admin` peut décider. L'approbation d'un produit et de sa preuve est atomique et exige une boutique déjà approuvée.

## Conditions de soumission

- boutique : propriétaire ou manager, présentation d'au moins 20 caractères et pays d'expédition ;
- produit : membre de la boutique, boutique déjà soumise ou approuvée, description d'au moins 40 caractères ;
- offre : variante active avec prix strictement positif ;
- confiance : preuve en attente avec résumé public proposé d'au moins 20 caractères.

## Conditions de décision

- session authentifiée dont le rôle persistant est `operator` ou `admin` ;
- objet actuellement `under_review` ;
- motif interne de 10 à 2 000 caractères ;
- preuve en attente appartenant au produit ;
- résumé public validé de 20 à 1 000 caractères pour une approbation ;
- boutique approuvée avant publication d'un produit.

## Journal d'audit

Chaque décision crée une ligne immuable dans `moderation_decisions` avec type d'objet, identifiant, décision, motif, opérateur et horodatage. Les clients et vendeurs ne peuvent ni insérer ni lire ce journal ; une policy dédiée le réserve aux opérateurs.

## Défense en profondeur

- aucune mutation directe de boutique, catalogue ou preuve accordée au rôle `authenticated` ;
- fonctions `security definer` avec `search_path` vide ;
- vérification de rôle à proximité de la donnée, en plus du contrôle de route et de Server Action ;
- actions serveur validées et autorisées à nouveau ;
- page opérations exclue de l'indexation.

## Limites suivantes

L'édition d'un objet rejeté, la nouvelle soumission d'une preuve corrigée, les pièces binaires et la révocation post-publication feront l'objet de transitions distinctes. Aucun grant générique ne sera réintroduit.
