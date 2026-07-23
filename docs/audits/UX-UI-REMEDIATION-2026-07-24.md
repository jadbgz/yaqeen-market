# Réponse à l’audit UX/UI du 23 juillet 2026

## Décisions

L’audit a été confronté au code de `main` et aux parcours réels desktop/mobile. Certaines observations décrivaient déjà un état dépassé : le menu Catégories, les skeletons, les pages d’erreur et le header marchand existaient. Le chantier corrige donc les ruptures encore observables sans refaire ces acquis.

### Adopté maintenant

- distinction entre orange décoratif (`#ef6b38`) et orange textuel (`#ad3f17`, ratio 4,62:1 sur le papier) ;
- texte informatif à 11 px minimum, phrases à 12 px ou plus ;
- texte encre sur les CTA orange ;
- focus clavier visible et réduction des mouvements ;
- indication de défilement et accès à toutes les catégories sur mobile ;
- feedback après ajout au panier avec lien direct vers le panier ;
- barre d’achat sticky sur la fiche produit mobile ;
- affichage/masquage du mot de passe ;
- landing vendeur publique sans message d’ingénierie ;
- centre d’aide et footer de confiance avec destinations réelles ;
- remplacement du lien mort de recommandation par un état honnête.

### Recommandations challengées

- **Méga-menu massif** : non retenu. Le menu existant est conservé et rendu mobile-friendly ; ajouter des entrées éditoriales sans contenu réel augmenterait le bruit.
- **Contenus juridiques complets** : non inventés. Le site expose clairement leur statut “avant ouverture” jusqu’à validation juridique.
- **Estimation de livraison sur la fiche** : différée jusqu’à l’existence d’une donnée calculable par boutique, destination et mode d’expédition. Une fausse fourchette nuirait davantage à la confiance.
- **Mode catalogue d’ouverture** : le vide reste assumé, mais contextualisé. Une alerte d’ouverture ne sera ajoutée qu’avec un consentement et une persistance réels.
- **Remplacement exhaustif de tous les glyphes** : les contrôles critiques du header utilisent déjà des SVG. Les glyphes décoratifs restants ne justifient pas un nouveau paquet d’icônes dans ce diff.

## Contrats vérifiés

- lint, typecheck et build de production ;
- parcours E2E desktop et Pixel 7 ;
- absence du message “variables Supabase” sur `/seller` ;
- footer et centre d’aide navigables ;
- bascule afficher/masquer du mot de passe ;
- ratios mesurés : orange textuel/papier 4,62:1, encre/orange 5,66:1, métadonnées/papier 5,23:1.
