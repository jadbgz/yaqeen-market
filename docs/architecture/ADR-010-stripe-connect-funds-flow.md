# ADR-010 — Stripe Connect et flux financiers multi-vendeurs

- Statut : accepté pour le pilote, implémentation réseau différée
- Date : 2026-07-17
- Portée : onboarding financier vendeur, paiement client, commissions, transferts, remboursements et litiges

## Décision

Yaqeen utilisera Stripe Connect avec :

- des comptes connectés configurés par propriétés de contrôleur, avec onboarding hébergé par Stripe et accès au Dashboard Express ;
- un paiement unique créé sur le compte plateforme pour la commande client ;
- le modèle **Separate Charges and Transfers** afin de ventiler une charge entre plusieurs boutiques ;
- un transfert distinct par `shop_order`, associé au paiement par identifiants internes et clés d'idempotence ;
- Stripe Payment Element sur le web et Stripe Payment Sheet dans l'application Expo native ;
- les webhooks Stripe comme seule autorité pour confirmer un succès ou un échec asynchrone.

Le modèle de destination charge est rejeté pour le panier global : il ne possède qu'une destination par charge. Les direct charges sont rejetées car elles imposeraient un paiement séparé par vendeur et fragmenteraient l'expérience client.

## Configuration des comptes connectés

Le profil cible reproduit les responsabilités d'un compte Express moderne :

- Dashboard Stripe : `express` ;
- collecte des exigences d'identité : Stripe ;
- frais de paiement : plateforme ;
- pertes et soldes négatifs : plateforme ;
- capacité nécessaire : réception de transferts Stripe.

Le code devra utiliser les propriétés de contrôleur stables disponibles sur le compte Stripe du projet. Accounts v2 reste envisageable lorsque la version requise n'est plus en preview pour notre configuration. Le statut local ne devient `enabled` qu'après synchronisation serveur d'une capacité de transfert active ; un retour d'Account Link ne prouve jamais à lui seul que l'onboarding est terminé.

## Flux financier

1. Le serveur crée une réservation de commande et fige les prix.
2. Une tentative locale est créée avec le total serveur et une clé d'idempotence stable.
3. Le serveur crée un PaymentIntent Stripe sur le compte plateforme avec la même clé et un `transfer_group` dérivé de la commande.
4. Le client confirme avec Payment Element ou Payment Sheet. Le `client_secret` n'est jamais journalisé, stocké dans une URL ou communiqué à un autre client.
5. Le webhook signé est dédupliqué puis récupère l'objet Stripe à jour avant toute transition.
6. Après succès, la réservation devient stock consommé et la commande devient `paid` dans une même frontière métier.
7. Un transfert idempotent est créé par sous-commande uniquement lorsque la politique de libération vendeur est satisfaite.

La date précise des transferts et des payouts doit être validée avec Stripe et le conseil juridique. Stripe ne fournit pas de service d'escrow ; ce terme ne doit jamais apparaître dans le produit.

## Commission et rapprochement

La commission est calculée côté serveur par sous-commande et figée en centimes. Le transfert vendeur vaut :

`total sous-commande - commission Yaqeen`

La plateforme paie les frais Stripe. Son revenu net n'est donc pas égal à la commission brute. Aucun taux commercial n'est codé dans cet ADR public.

Chaque objet externe possède :

- un identifiant Stripe unique ;
- une clé d'idempotence persistée ;
- un montant et une devise figés ;
- un statut local contrôlé ;
- une trace permettant le rapprochement avec la commande et la sous-commande.

## Webhooks

Le handler devra :

1. lire le corps HTTP brut ;
2. vérifier `Stripe-Signature` avant tout parsing métier ;
3. refuser la confusion test/live ;
4. enregistrer l'identifiant d'événement, son type, sa version API et un hash du payload, sans conserver le payload complet contenant potentiellement des données personnelles ;
5. accepter les doublons sans rejouer les effets ;
6. ne jamais dépendre de l'ordre de livraison des événements ;
7. répondre rapidement puis traiter de manière asynchrone ;
8. limiter l'abonnement aux types réellement gérés.

Une clé d'événement Stripe empêche le même événement d'être traité deux fois. L'objet Stripe et le type d'événement permettent de détecter les doublons sémantiques éventuels.

## Remboursements et litiges

Avec Separate Charges and Transfers, Stripe débite les remboursements et litiges du solde plateforme. Un remboursement ne renverse pas automatiquement les transferts déjà envoyés : Yaqeen doit orchestrer les transfer reversals et supporter le risque d'un solde vendeur insuffisant.

Conséquences :

- réserve de trésorerie et monitoring obligatoires ;
- transferts différés tant que l'exécution vendeur n'est pas suffisamment sûre ;
- remboursement et reversal journalisés séparément ;
- webhook `charge.dispute.created` traité en priorité ;
- aucune promesse de remboursement instantané sans capacité financière correspondante.

## Sécurité

- clés secrètes et secret webhook exclusivement côté serveur ;
- clé publiable seulement dans les clients ;
- aucune mutation financière directe par `authenticated` ou `anon` ;
- RPC financières réservées au `service_role` ;
- montants recalculés depuis PostgreSQL, jamais acceptés depuis le client ;
- clés d'idempotence utilisées sur chaque requête Stripe `POST` ;
- environnement test distinct du live, avec événements et comptes non mélangeables ;
- logs limités aux identifiants techniques et codes d'erreur non sensibles.

## Sources Stripe vérifiées

- https://docs.stripe.com/connect/charges
- https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
- https://docs.stripe.com/connect/marketplace/tasks/onboard
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/connect/disputes
- https://docs.stripe.com/payments/payment-intents
- https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native

## Ce qui reste fermé

- aucun SDK Stripe n'est installé ;
- aucun endpoint ne crée de PaymentIntent ou d'Account Link ;
- aucun webhook public n'est exposé ;
- aucune transition vers `paid` ou création de transfert n'est disponible ;
- aucun checkout n'est affiché.

Le premier lot ne crée que le registre persistant et les frontières d'idempotence nécessaires à une future intégration sûre.
