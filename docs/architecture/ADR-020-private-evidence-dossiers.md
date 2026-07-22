# ADR-020 — Dossiers documentaires privés et renouvellement des preuves

- Statut : accepté
- Date : 22 juillet 2026
- Portée : preuves produit, Storage, Seller Center, modération et catalogue public

## Contexte

Une preuve réduite à des métadonnées et à un résumé ne permet pas à l'équipe Yaqeen de confronter une déclaration à son document source. Rendre le certificat public exposerait toutefois des références, coordonnées, signatures ou informations contractuelles qui ne sont pas destinées aux clients. Enfin, attendre l'expiration avant de déposer un renouvellement provoquerait une coupure évitable du catalogue.

## Décision

Chaque preuve peut posséder une pièce PDF dans `product_evidence_documents`. Le registre conserve le chemin privé, le nom original normalisé, la taille et l'empreinte SHA‑256. La pièce est stockée dans le bucket privé `product-evidence`, limité à 10 Mo et au type `application/pdf`.

Le vendeur envoie le fichier au serveur web. Le serveur vérifie la signature PDF et sa terminaison, calcule l'empreinte sur les octets réellement reçus, pré-enregistre le dossier par RPC puis téléverse avec `service_role`. Aucune politique Storage n'autorise un vendeur ou un opérateur à créer, remplacer ou supprimer directement un objet. Cela empêche un client hostile de déclarer l'empreinte d'un fichier et d'envoyer d'autres octets. Les lectures passent par des URL signées de dix minutes configurées en téléchargement.

Les métadonnées du dossier sont en RLS et ne sont lisibles que par les membres de la boutique concernée et les rôles opérateur/admin. Les visiteurs anonymes ne peuvent lire ni le registre ni l'objet, même après l'approbation de la preuve. Seuls le résumé public, le périmètre et les éléments explicitement approuvés restent exposables par `product_evidence`.

## Renouvellement sans interruption

Un produit publié peut recevoir une preuve `pending` sans changer d'état. Une seule soumission de renouvellement est autorisée à la fois. L'ancienne preuve approuvée continue de protéger la vente pendant la revue. En cas d'approbation, l'ancienne preuve passe à `revoked`, la nouvelle à `approved` et le résumé public bascule dans la même transaction. Un refus laisse la preuve courante et la publication intactes.

Une preuve tierce ne peut être approuvée que si son enregistrement documentaire possède réellement un objet Storage. Cette règle est appliquée par un trigger commun aux premières publications et aux renouvellements, puis réaffirmée dans la RPC de renouvellement. Une déclaration vendeur peut rester sans pièce, mais son niveau de preuve demeure explicite.

## Sécurité opérationnelle

- les mutations du registre sont RPC-only ;
- l'auto-approbation vendeur est interdite ;
- le PDF ne devient jamais public ;
- le téléchargement forcé réduit l'exposition du back-office au contenu actif d'un PDF ;
- un objet doit être supprimé par le serveur avant que son enregistrement puisse être retiré ;
- chaque décision de renouvellement est journalisée comme `product_evidence`.

## Vérification

`evidence_dossiers.test.sql` couvre le bucket, les privilèges, la RLS, l'IDOR, l'absence totale d'écriture Storage authentifiée, l'unicité, les empreintes, l'auto-approbation, le document obligatoire, la confidentialité après approbation, la bascule atomique, le refus et la continuité de publication.

## Limites assumées

La validation syntaxique et l'isolement en téléchargement ne remplacent pas un moteur antivirus/CDR. Avant ouverture publique à grande échelle, le serveur devra placer les nouveaux objets en quarantaine, obtenir un verdict asynchrone d'un moteur spécialisé et n'autoriser la revue que pour un verdict `clean`. La politique de rétention des dossiers rejetés devra être alignée sur les obligations juridiques validées par conseil.
