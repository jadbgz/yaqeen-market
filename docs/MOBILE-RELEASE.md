# Distribution mobile Yaqeen

Ce document décrit le chemin contrôlé entre le dépôt et un binaire installable. Il ne contient ni identifiant de compte, ni secret, ni référence d'environnement hébergé.

## Profils

| Profil | Identité native | Usage | Distribution |
| --- | --- | --- | --- |
| `development` | `market.yaqeen.app.dev` | développement sur appareil avec outils Expo | interne |
| `development-simulator` | `market.yaqeen.app.dev` | simulateur iOS | interne |
| `preview` | `market.yaqeen.app.preview` | recette sur appareils physiques | interne |
| `production` | `market.yaqeen.app` | App Store et Google Play | verrouillé |

Les schémas d'URL sont respectivement `yaqeen-dev://`, `yaqeen-preview://` et `yaqeen://`. Chaque callback `.../auth/callback` doit être autorisé dans l'environnement Supabase correspondant.

Le profil production est volontairement bloqué par `scripts/validate-release-env.mjs`. Le backend et les clients refusent encore Stripe live : produire un binaire public avant l'ouverture et le test de cette frontière créerait une application incapable d'encaisser une commande réelle.

## Initialisation EAS — une seule fois

Ces opérations modifient un compte Expo externe. Elles doivent être réalisées par un propriétaire du projet après vérification de l'organisation ciblée.

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli whoami
npx eas-cli init
```

Le `projectId` non secret créé par `eas init` doit ensuite être versionné dans `extra.eas.projectId` de `app.config.ts` dans une PR dédiée.

## Variables EAS

Créer séparément les quatre valeurs publiques suivantes dans les environnements EAS `development` et `preview` :

- `EXPO_PUBLIC_SUPABASE_URL` ;
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ;
- `EXPO_PUBLIC_SITE_URL` ;
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Les URL doivent être hébergées en HTTPS et la clé Stripe doit rester une clé `pk_test_`. Les variables `EXPO_PUBLIC_*` sont intégrées au bundle et doivent toujours être considérées comme publiques. Aucune clé Supabase `service_role`, clé Stripe secrète ou secret de webhook ne doit être configuré ici.

Avant un build, contrôler la cible :

```bash
npx eas-cli env:list --environment preview
npx eas-cli config --platform all --profile preview
```

## Premiers builds internes

```bash
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

Android produit un APK installable. iOS utilise une distribution interne et nécessite l'enregistrement des appareils de recette. Aucun de ces binaires ne doit être soumis aux stores.

## Gate avant production

Le verrou production ne pourra être retiré qu'après validation documentée de tous les points suivants :

1. projet Supabase production isolé, migrations appliquées et restauration testée ;
2. domaine web de production, callbacks Auth et liens universels validés ;
3. Stripe Connect live activé, webhooks live séparés et rapprochement vérifié ;
4. une commande live plafonnée payée, expédiée, transférée et remboursée ;
5. monitoring, alertes, limitation de débit et MFA opérateur actifs ;
6. suppression de compte, politique de confidentialité et déclarations stores relues ;
7. tests sur iPhone et Android physiques, puis pilote TestFlight/Play fermé validé.

Le déverrouillage doit remplacer explicitement les contrôles `pk_test_` par une configuration multi-environnement auditée ; il ne doit pas consister à supprimer le garde-fou.
