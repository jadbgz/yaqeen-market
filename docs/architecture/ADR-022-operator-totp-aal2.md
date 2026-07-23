# ADR-022 — MFA TOTP et AAL2 pour les opérations

## Statut

Accepté le 23 juillet 2026. Garde applicative active ; garde PostgreSQL livrée mais désactivée jusqu’à la fin du protocole anti-lockout.

## Décision

Les rôles `operator` et `admin` doivent utiliser un facteur TOTP vérifié pour accéder à `/operations`. Le niveau d’assurance (`aal`) est lu depuis les claims Supabase, jamais depuis un état client déclaré.

`public.is_operator()` sait également exiger `aal2` pour toutes les policies RLS et RPC opérateur. Cette exigence est commandée par une ligne privée inaccessible aux clients. Seul le `service_role` peut activer ou désactiver la politique avec la phrase de confirmation exacte.

## Séquence de déploiement obligatoire

1. appliquer la migration en staging ; la politique SQL reste à `false` ;
2. vérifier que TOTP est activé dans le projet Supabase hébergé ;
3. enrôler deux comptes `admin` distincts depuis `/compte/securite` ;
4. confirmer que chacun obtient une session `aal2` et ouvre `/operations` ;
5. tester la procédure de récupération administrateur Supabase sur un compte non critique ;
6. activer la garde SQL avec :

```sql
select public.set_operator_aal2_enforcement(
  true,
  'ENABLE_OPERATOR_AAL2_AFTER_TWO_ENROLLMENTS'
);
```

7. rejouer un test AAL1 refusé / AAL2 autorisé via PostgREST ;
8. répéter la séquence en production.

En urgence, le `service_role` peut exécuter :

```sql
select public.set_operator_aal2_enforcement(false, 'ROLLBACK');
```

## Récupération

Cette phase ne crée pas de pseudo-codes de secours applicatifs : ils ne pourraient pas élever proprement le JWT Supabase à `aal2`. Tant qu’un mécanisme de récupération à usage unique, audité et compatible avec l’AAL n’est pas livré, la récupération passe par la procédure administrateur Supabase avec double contrôle humain.

La garde SQL ne doit donc jamais être activée avec un seul administrateur enrôlé.

## Conséquences

- un mot de passe ou une session AAL1 compromis ne suffit plus pour l’interface opérations ;
- un client AAL2 ne devient jamais opérateur : rôle et assurance sont tous deux nécessaires ;
- le déploiement reste réversible sans modifier les policies une par une ;
- la suppression d’un facteur n’est pas proposée dans l’interface opérateur afin d’éviter un auto-lockout accidentel.
