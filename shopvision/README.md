# Studio ShopVision — première intégration web

Ouvrir `marche-senegal-shopvision.html` depuis le menu vendeur ou « Ma boutique ».

## Disponible

- Catalogue réel via `GET /api/shops/products`, boutique via le dashboard existant.
- Import d'une photo haute définition (JPG/PNG/WebP, 15 Mo) via le flux serveur dédié ShopVision, zoom, déplacement et points associés aux produits.
- Vérification explicite des points, modification des coordonnées et suppression.
- Brouillon local IndexedDB, isolé par compte et boutique ; sauvegarde du fichier sans conversion base64.
- Aperçu sans publier, fiches avec prix et disponibilité relus depuis l'API.
- Publication via l'upload Cloudinary existant puis `PUT /api/shops/me/showcase` ; compatible avec la vitrine publique et le parcours produit/panier existants.
- Menu vendeur partagé et lien depuis « Ma boutique ». L'enregistrement des informations de boutique ne republie plus sa copie ancienne de la vitrine.

## Limites de cette livraison

Une photo principale ; aucune détection IA ni fausse suggestion. L'upload ShopVision est limité à 15 Mo et produit un dérivé Cloudinary jusqu'à 2400 px ; la validation des dimensions décodées et la génération de variantes WebP/AVIF plus fines viendront avec le worker média. Le brouillon reste sur cet appareil et n'est pas synchronisé entre appareils. La vérification de changement avant publication est une vérification client, pas un verrou transactionnel contre deux publications simultanées. L'évolution multi-photo/versionnée décrite dans `../../docs/architecture/shopvision-ai.md` reste à réaliser.

Aucune migration ni écriture en production n'a été effectuée pour vérifier cette intégration. Les tests de publication utilisent des réponses API simulées ; un parcours avec une vraie session vendeur et un upload réel reste à valider par le propriétaire.

## Développement et vérifications

Depuis la racine `ms` :

```sh
node marche-senegal/tools/serve-local.cjs
node --test marche-senegal/tools/tests/shopvision.test.cjs marche-senegal/tools/tests/shopvision-dom.test.cjs
```

Le serveur web écoute uniquement `127.0.0.1:5500`. L'API locale attendue par `api.js` est sur le port 3000. La suite DOM réutilise JSDOM déjà installé dans le dépôt mobile voisin ; les tests de règles pures n'ont aucune dépendance externe. Les dépendances du mobile doivent être installées pour exécuter la suite DOM.
