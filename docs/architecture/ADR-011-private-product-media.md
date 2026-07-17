# ADR-011 — Médias produit privés, normalisés et modérés

- Statut : accepté et implémenté
- Date : 17 juillet 2026
- Portée : C4, C6, C11, C14, C16, C18

## Décision

Les images produit suivent un domaine métier commun au web et à l’application mobile. Le fichier n’est jamais une URL arbitraire enregistrée par le vendeur.

1. Le Seller Center reçoit un fichier JPEG, PNG, WebP ou AVIF de 6 Mio maximum.
2. Une Server Action authentifie de nouveau le vendeur, décode le contenu avec Sharp, refuse les fichiers illisibles, animés, trop petits ou démesurés, corrige l’orientation, limite chaque côté à 2 400 px et produit un WebP de qualité contrôlée.
3. La RPC `create_product_media_draft` vérifie l’appartenance à la boutique, l’état modifiable du produit, la position 1–6, les dimensions et le poids calculés. Elle génère elle-même un chemin UUID imprévisible.
4. Le fichier normalisé est envoyé dans le bucket privé `product-media`. La policy Storage n’accepte que l’objet préalablement enregistré pour ce vendeur et ce produit.
5. La soumission à revue exige au moins un média `pending` possédant réellement un objet Storage.
6. La décision opérateur approuve ou rejette dans une même transaction la preuve, tous les médias en attente et la publication du produit. Chaque média produit son propre événement d’audit.
7. Un visiteur anonyme ne peut lire que les métadonnées approuvées d’un produit publié par une boutique approuvée. Le web et l’app obtiennent ensuite des URL signées d’une heure auprès de Storage.

## Invariants

- une fiche publiée possède au moins une image approuvée et stockée ;
- un produit contient au plus six médias actifs et une seule image active par position ;
- un vendeur ne peut ni écrire directement les métadonnées, ni s’auto-approuver, ni supprimer un média approuvé ;
- les objets en attente ne sont lisibles que par la boutique concernée et les opérateurs ;
- le bucket est privé et n’expose aucune URL publique permanente ;
- le texte alternatif est obligatoire et conservé dans le contrat public ;
- les clients web, iOS et Android utilisent la même sélection de médias ordonnée.

## Performance

La normalisation à l’entrée évite de conserver les PNG multi-mégaoctets du vendeur comme origine de diffusion. Les WebP sont bornés à 4 Mio dans Storage ; la cible habituelle après compression est nettement inférieure. `next/image` fixe les dimensions d’affichage et `expo-image` fournit les caches mémoire/disque sur mobile.

Les transformations Supabase à la volée restent possibles plus tard, mais ne sont pas nécessaires au premier lot et peuvent être facturées par image origine. Le projet préfère d’abord un fichier origine déjà optimisé et des métriques réelles avant d’ajouter plusieurs rendus.

## Limites assumées

- le recadrage éditorial et la réorganisation par glisser-déposer restent à construire ;
- l’analyse antivirus ou de contenu assistée ne remplace pas la revue humaine et n’est pas incluse ;
- les URL signées expirent : le catalogue recharge ses données avant expiration, il ne doit pas les persister dans une commande ;
- la suppression physique des objets rejetés devra être automatisée par une tâche de rétention.

## Sources techniques

- [Supabase Storage — contrôle d’accès RLS](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Storage — buckets privés](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Storage — URL signées](https://supabase.com/docs/guides/storage/serving/downloads)
- [Next.js 16 — optimisation des images](https://nextjs.org/docs/app/getting-started/images)
- [Expo SDK 57 — expo-image](https://docs.expo.dev/versions/v57.0.0/sdk/image/)
