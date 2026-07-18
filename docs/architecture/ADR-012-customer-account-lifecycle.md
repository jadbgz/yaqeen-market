# ADR-012 — Cycle de vie du compte client

- Statut : accepté pour le socle client
- Date : 2026-07-18
- Portée : adresses, accès, historique et suppression

## Décision

Le compte client repose sur quatre frontières distinctes :

1. Supabase Auth gère mots de passe, sessions et liens de récupération PKCE ;
2. `customer_addresses` conserve au maximum dix adresses privées par client, modifiables uniquement par RPC propriétaire ;
3. `order_shipping_addresses` conserve une copie immuable au moment de la réservation, lisible par le client et les vendeurs chargés de l'expédition ;
4. `account_deletion_requests` enregistre une demande idempotente, annulable pendant au moins trente jours.

L'interface de récupération retourne toujours le même message afin de ne pas révéler si une adresse e-mail possède un compte. Un changement volontaire de mot de passe exige le mot de passe actuel. Le lien de récupération constitue son propre parcours et doit produire une session valide avant d'autoriser la mise à jour.

## Suppression et conservation

Le navigateur n'obtient jamais de clé d'administration et ne supprime jamais directement un utilisateur Auth. Une demande ne vaut donc pas suppression immédiate. Le traitement final sera exécuté par un worker de confiance après application d'une matrice de conservation couvrant :

- obligations comptables et historiques de commande ;
- anonymisation des données qui n'ont plus à identifier le client ;
- transfert ou suppression préalable des objets Storage appartenant à l'utilisateur ;
- invalidation des sessions encore actives et journalisation du résultat.

La demande terminée peut survivre sans identifiant client (`ON DELETE SET NULL`) afin de conserver la preuve opérationnelle sans maintenir inutilement le lien vers le profil supprimé.

Ce mécanisme technique ne constitue pas, à lui seul, une validation juridique RGPD.

## Invariants de sécurité

- aucune écriture directe `authenticated` sur les adresses ou demandes de suppression ;
- identité toujours dérivée de `auth.uid()` dans les RPC ;
- une seule adresse par défaut et une seule demande de suppression en attente par compte ;
- aucun vendeur ne lit le carnet d'adresses ; il ne lit que le snapshot des commandes de sa boutique ;
- une modification ou suppression du carnet ne réécrit jamais une commande historique ;
- toute opération sensible est revérifiée côté serveur même si sa page est protégée.

## Limites assumées

- l'application Expo ne partage pas encore l'authentification et le compte ;
- aucune suppression Auth finale n'est automatisée avant validation de la conservation ;
- aucun transporteur ou tarif de livraison n'est encore sélectionné ;
- les tests E2E du lien e-mail nécessitent un environnement Auth dédié.
