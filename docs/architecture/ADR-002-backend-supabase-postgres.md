# ADR-002 — Backend Supabase/PostgreSQL

- Statut : accepté pour le socle initial
- Date : 2026-07-13
- Portée : C4, C5, C6, C7, C15, C16

## Décision

Le premier backend Yaqeen utilisera PostgreSQL géré par Supabase, Supabase Auth et des migrations SQL versionnées. Les règles d'autorisation sensibles seront appliquées dans PostgreSQL avec Row Level Security, en complément des contrôles serveur.

Le choix ne signifie pas que les clients accèdent librement à toutes les tables. Les opérations privilégiées, la modération, les paiements et les webhooks resteront exécutés côté serveur avec des secrets non exposés.

## Pourquoi ce choix

- PostgreSQL constitue une source de vérité adaptée aux commandes, stocks, preuves et relations multi-vendeurs.
- Auth et RLS partagent le même identifiant utilisateur et permettent une défense en profondeur.
- Les migrations SQL évitent les changements manuels non reproductibles.
- Le web Next.js et l'application Expo peuvent consommer les mêmes contrats sans dupliquer la logique métier.
- La solution permet d'avancer sans adopter immédiatement un moteur e-commerce complet dont les abstractions pourraient contraindre le modèle de preuve Yaqeen.

## Ce qui est différé

- création et liaison du projet Supabase distant ;
- choix définitif d'hébergement et analyse contractuelle/RGPD ;
- stockage des documents de preuve ;
- commandes, paiements Stripe Connect et webhooks ;
- génération automatique des types TypeScript.

## État d'implémentation — 15 juillet 2026

- environnement local Supabase initialisé et versionné ;
- clients navigateur/serveur isolés derrière `src/lib/supabase` ;
- sessions SSR en cookies rafraîchies par le Proxy Next.js 16 ;
- identité vérifiée côté serveur avec `getClaims()`, jamais avec `getSession()` pour une décision d'autorisation ;
- inscription e-mail/mot de passe en PKCE, confirmation, connexion et déconnexion câblées ;
- 32 assertions pgTAP et lint PostgreSQL ajoutés à la CI, incluant l'onboarding vendeur atomique.

`@supabase/ssr` reste officiellement en bêta. Son usage est donc encapsulé afin de limiter l'impact d'une évolution de son API. La migration n'a pas pu être exécutée localement sur la machine de développement, faute de runtime Docker ; la CI constitue le premier environnement d'exécution reproductible.

## Règles

1. Toute évolution de schéma passe par `supabase/migrations`.
2. Toute table exposée active RLS avant d'être consommée.
3. Le rôle `service_role` ne doit jamais être inclus dans un bundle client.
4. Une preuve produit distingue son type, son émetteur, sa période de validité, son périmètre et sa décision de revue.
5. Le stock distingue au minimum quantité physique et quantité réservée.
6. Les statuts métier utilisent des valeurs fermées et versionnées.

## Alternatives rejetées à ce stade

- données en fichiers TypeScript : non persistantes et non administrables ;
- Shopify headless : rapide pour le commerce simple mais moins adapté au contrôle documentaire et au multi-vendeur spécifique ;
- moteur marketplace complet immédiat : coût d'intégration élevé avant stabilisation des règles Yaqeen ;
- Prisma ajouté dès la première migration : couche supplémentaire non nécessaire tant que le domaine et les requêtes ne sont pas stabilisés.

## Critère de révision

Revoir cette décision après un parcours staging complet : authentification, création de boutique, publication d'un produit avec preuve, réservation de stock et commande multi-vendeurs.
