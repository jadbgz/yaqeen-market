# ADR-017 — Frontière de paiement native

## Décision

Le checkout iOS/Android utilise Stripe PaymentSheet. L'application ne crée jamais elle-même une commande, un montant ou un PaymentIntent : elle transmet un jeton Supabase bearer, une adresse appartenant au client et des couples `variantId/quantity` à `/api/mobile/checkout/session`.

Le serveur vérifie le jeton auprès de Supabase Auth, exécute la même réservation PostgreSQL atomique que le web, recalcule le montant depuis les variantes actives et crée une tentative Stripe idempotente. La clé service role et la clé Stripe secrète ne quittent jamais le serveur.

La réussite de PaymentSheet ne confirme pas la commande. L'écran mobile relit la commande protégée par RLS jusqu'à ce que le webhook Stripe signé fasse évoluer son statut. Le panier n'est vidé qu'après le retour positif de PaymentSheet.

## Persistance du panier

Le stockage local contient seulement les UUID de variantes et les quantités. À chaque démarrage, les lignes sont rapprochées du catalogue actuellement publié : produits retirés, variantes absentes et ruptures sont supprimés ou bornés. Les prix, preuves, stocks et URL média ne deviennent donc jamais des sources de vérité locales.

## Portée

- cartes de test uniquement ; les clés live sont refusées par la configuration serveur et mobile ;
- Apple Pay et Google Pay désactivés jusqu'à validation des identifiants marchands et des builds natifs ;
- le web Expo reste une prévisualisation et n'embarque pas le SDK Stripe natif ;
- les exports web, Android et iOS sont contrôlés par la CI.
