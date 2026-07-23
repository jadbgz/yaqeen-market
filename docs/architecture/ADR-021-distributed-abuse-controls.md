# ADR-021 — Défense anti-abus distribuée et quotas métier

## Statut

Accepté le 23 juillet 2026. L’activation distante reste une condition de mise en staging.

## Contexte

Les invariants PostgreSQL et l’idempotence Stripe protègent la cohérence, mais ils ne protègent pas les coûts engagés avant la transaction : appels Auth, Stripe, traitement Sharp, mémoire et connexions Supabase. Une protection uniquement dans Next.js serait par ailleurs contournable par les clients mobiles ou les appels PostgREST directs.

## Décision

Yaqeen emploie quatre couches complémentaires :

1. WAF/CDN en amont du runtime ;
2. limites distribuées Upstash Redis avant les frontières coûteuses ;
3. limites natives Supabase Auth, confirmation e-mail et CAPTCHA sur le projet hébergé ;
4. quotas transactionnels PostgreSQL dans un schéma `private`.

Les clés Redis ne contiennent jamais d’IP, d’UUID, d’e-mail ou de jeton brut. Le sujet est transformé par HMAC-SHA-256 avec un pepper propre à l’environnement. L’adresse IP n’est acceptée que depuis un en-tête garanti par le proxy déclaré.

Les mutations financières, Auth, Connect et uploads échouent fermées si Redis est indisponible. Le webhook Stripe n’utilise pas Redis afin de ne pas bloquer ses reprises légitimes ; son corps est lu avec un plafond dur de 512 Kio avant vérification de signature.

## Limites initiales

| Frontière | Limite |
| --- | ---: |
| Connexion web | 10/minute/IP |
| Inscription web | 5/heure/IP |
| Reset de mot de passe | 10/heure/IP |
| Checkout | 10/15 minutes/IP et 5/minute/utilisateur |
| Onboarding Connect | 5/heure/utilisateur |
| Synchronisation Connect | 12/heure/utilisateur |
| Média produit | 4/10 minutes/utilisateur |
| Dossier PDF | 3/heure/utilisateur |
| Commandes créées | 20/jour/client en PostgreSQL |
| Unités réservées | 200/jour/client en PostgreSQL |

Ces valeurs sont des seuils de départ à recalibrer sur les métriques de staging. Le quota PostgreSQL est transactionnel : un échec complet de la transaction ne consomme rien. Redis contrôle les tentatives avant la base.

## Déploiement

`npm run security:check-abuse-config` doit réussir dans le job de promotion staging et production. Le déploiement doit également vérifier dans le projet Supabase hébergé :

- confirmation e-mail activée ;
- Turnstile activé sur inscription et récupération ;
- limites Auth natives conservées ;
- état distant vérifié explicitement, sans déduire celui-ci de `supabase/config.toml`.

L’absence de secrets Redis n’empêche volontairement pas le développement local lorsque `RATE_LIMIT_ENABLED=false`, mais elle interdit toute promotion publique.

## Conséquences

- un incident Redis bloque temporairement les mutations sensibles avec `503`, jamais avec un faux `429` ;
- les clients web et mobile partagent les mêmes limites checkout ;
- les appels PostgREST directs restent bornés par les triggers privés ;
- aucun événement de refus brut n’est écrit en base, pour éviter qu’un attaquant transforme la journalisation en amplification.
