# 🇸🇳 MARCHÉ SÉNÉGAL — Briefing Projet pour Claude Code

## Vue d'ensemble

Marché Sénégal est une marketplace SaaS qui digitalise les marchés physiques du Sénégal (Sandaga, Tilène, HLM, Touba, Ziguinchor). Les vendeurs créent des boutiques en ligne, les acheteurs commandent et paient via Wave ou Orange Money.

---

## Architecture du projet

### Localisation des fichiers

```
C:\Users\samb9\Desktop\
├── marche-senegal\              ← FRONTEND (16 pages HTML)
│   ├── api.js                   ← Fichier JS partagé — toutes les fonctions API
│   ├── marche-senegal-accueil.html
│   ├── marche-senegal-marche.html
│   ├── marche-senegal-boutique.html
│   ├── marche-senegal-produit.html
│   ├── marche-senegal-recherche.html
│   ├── marche-senegal-panier.html
│   ├── marche-senegal-profil.html
│   ├── marche-senegal-commande.html
│   ├── marche-senegal-connexion-acheteur.html
│   ├── marche-senegal-connexion-vendeur.html
│   ├── marche-senegal-connexion-admin.html
│   ├── marche-senegal-dashboard.html
│   ├── marche-senegal-mes-produits.html
│   ├── marche-senegal-mes-commandes.html
│   ├── marche-senegal-ajout-produit.html
│   └── marche-senegal-admin.html
│
└── marche-senegal-backend\      ← BACKEND Node.js
    ├── src\
    │   ├── server.js            ← Point d'entrée — port 3000
    │   ├── routes\
    │   │   ├── auth.routes.js   ← OTP, JWT, inscription, connexion
    │   │   ├── market.routes.js ← Marchés
    │   │   ├── shop.routes.js   ← Boutiques + dashboard vendeur
    │   │   ├── product.routes.js← Produits CRUD
    │   │   └── order.routes.js  ← Commandes
    │   └── middleware\
    │       └── auth.middleware.js← protect() + restrictTo()
    ├── prisma\
    │   ├── schema.prisma        ← 15 tables PostgreSQL
    │   └── seed.js              ← Données de test
    └── .env                     ← Variables d'environnement
```

---

## Stack technique

### Frontend
- HTML5 + CSS3 + JavaScript Vanilla
- Pas de framework — tout en vanilla JS
- `api.js` est le fichier partagé importé dans chaque page HTML
- Live Server sur `http://127.0.0.1:5500`

### Backend
- Node.js v25 + Express
- PostgreSQL 16 (port 5432)
- Prisma ORM v5.22.0
- JWT pour l'authentification
- Twilio pour les SMS OTP
- Démarrage : `npm run dev` dans le dossier backend

---

## Base de données

### Connexion
```
DATABASE_URL="postgresql://marche_user:marche2025@localhost:5432/marche_senegal"
User: marche_user
Password: marche2025
Database: marche_senegal
```

### 15 Tables
- `users` — acheteurs, vendeurs, admins
- `shops` — boutiques des vendeurs
- `products` — produits
- `orders` — commandes
- `order_items` — articles des commandes
- `payments` — paiements
- `markets` — marchés physiques (5 marchés en DB)
- `categories` — catégories (8 catégories)
- `deliveries` — livraisons
- `reviews` — avis clients
- `messages` — chat
- `promotions` — codes promo
- `favorites` — favoris
- `addresses` — adresses
- `otp_codes` — codes SMS

### Comptes de test
```
Acheteur  : +221770000001 (Fatou Ndiaye)
Acheteur2 : +221771111101 (Aminata Diallo)
Vendeur   : +221770000002 (Fatou Ndoye — boutique: Mode Fatou Ndoye — Sandaga)
Vendeur2  : +221771111102 (Moussa Sow — boutique: Tissus Moussa Sow — Tilène)
Admin     : admin@marche-senegal.sn / Admin@2025Secure
```

---

## Authentification — Architecture des 3 portails

### Portail Acheteur
- Page : `marche-senegal-connexion-acheteur.html`
- Mode : OTP par SMS
- Après connexion → `marche-senegal-accueil.html`
- Si vendeur essaie → redirigé vers page vendeur

### Portail Vendeur
- Page : `marche-senegal-connexion-vendeur.html`
- Mode : OTP par SMS
- Inscription : numéro → OTP → infos boutique → CNI
- Après connexion → `marche-senegal-dashboard.html`
- Si acheteur essaie → redirigé vers page acheteur

### Portail Admin
- Page : `marche-senegal-connexion-admin.html`
- Mode : Email + Mot de passe (pas OTP)
- Après connexion → `marche-senegal-admin.html`
- Pas d'inscription publique

### Routes API d'authentification
```
POST /api/auth/send-otp         → Envoyer SMS OTP
POST /api/auth/verify-otp       → Vérifier code + retourner JWT
POST /api/auth/register-buyer   → Finaliser inscription acheteur
POST /api/auth/register-seller  → Créer boutique vendeur
POST /api/auth/login-admin      → Connexion admin email/password
POST /api/auth/setup-admin      → Configurer admin (clé: MARCHE_SENEGAL_ADMIN_2025)
GET  /api/auth/me               → Profil connecté (token requis)
```

---

## Fonctionnement de api.js (Frontend)

Le fichier `api.js` est importé dans chaque page HTML. Il contient :

```javascript
const API_URL = 'http://localhost:3000';

// Fonction principale
async function apiCall(endpoint, options = {})

// Auth
async function sendOTP(phone)
async function verifyOTP(phone, code)
function getCurrentUser()
function isLoggedIn()
function logout()

// Données
async function getMarkets()
async function getProducts(filters)
async function getProduct(id)
async function getShops(filters)
async function getShop(id)
async function getDashboard()
async function getShopOrders()
async function createProduct(data)
async function createOrder(data)
async function getMyOrders()
async function getOrder(id)
async function updateOrderStatus(id, status)

// Utilitaires
function formatPrice(price)
function showToast(msg)
function showLoading(containerId)
function showError(containerId, msg)
```

---

## Pages et leurs rôles

### Pages Acheteur (publiques)
| Page | Fonction |
|------|----------|
| `accueil.html` | Produits populaires + marchés — chargés depuis API |
| `marche.html` | Boutiques et produits d'un marché — URL: `?id=MARKET_ID` |
| `boutique.html` | Détail boutique + produits — URL: `?id=SHOP_ID` |
| `produit.html` | Détail produit + avis — URL: `?id=PRODUCT_ID` |
| `recherche.html` | Recherche avec filtres — URL: `?q=QUERY` |
| `panier.html` | Panier localStorage + commande API |
| `profil.html` | Commandes acheteur depuis API |
| `commande.html` | Suivi commande en temps réel — URL: `?id=ORDER_ID` |

### Pages Vendeur (protégées — rôle SELLER)
| Page | Fonction |
|------|----------|
| `dashboard.html` | Stats + commandes récentes + produits |
| `mes-produits.html` | Grille produits + modifier stock + supprimer |
| `mes-commandes.html` | Toutes commandes + changer statut |
| `ajout-produit.html` | Formulaire ajout produit → API |

### Page Admin (protégée — rôle ADMIN)
| Page | Fonction |
|------|----------|
| `admin.html` | KPIs + vendeurs + litiges + marchés + logs |

---

## Ce qui fonctionne déjà ✅

- [x] 16 pages HTML frontend complètes et responsive
- [x] Backend Node.js + Express démarré sur port 3000
- [x] Base de données PostgreSQL avec 15 tables
- [x] Authentification OTP SMS (code affiché en dev)
- [x] JWT tokens avec expiration 7 jours
- [x] 3 portails séparés avec protection des rôles
- [x] Redirection selon le rôle (BUYER/SELLER/ADMIN)
- [x] API Marchés, Boutiques, Produits, Commandes
- [x] Panier localStorage + création commande API
- [x] Dashboard vendeur avec stats réelles
- [x] Gestion produits vendeur (modifier, supprimer, stock)
- [x] Gestion commandes vendeur (confirmer, préparer, livrer)
- [x] Dashboard admin avec KPIs
- [x] Suivi commande acheteur avec timeline
- [x] Twilio intégré (Auth Token à corriger)

---

## Ce qui reste à faire ❌

### 🔴 Priorité haute

#### 1. Corriger Twilio SMS
**Problème :** Auth Token incorrect dans `.env`
**Fichier :** `marche-senegal-backend\.env`
**Action :** Mettre le bon `TWILIO_AUTH_TOKEN` depuis console.twilio.com
**Test :** `POST /api/auth/send-otp` avec un vrai numéro sénégalais

#### 2. Upload photos avec Cloudinary
**Problème :** Les produits n'ont pas de vraies photos
**Fichiers à créer :**
- `src/routes/upload.routes.js`
- `src/services/upload.service.js`
**Action :**
```javascript
// Installer
npm install cloudinary multer-storage-cloudinary

// Route à créer
POST /api/upload/image → Upload image → retourner URL Cloudinary

// Modifier ajout-produit.html
// Remplacer les slots photos statiques par de vrais uploads
```
**Variables .env :**
```
CLOUDINARY_CLOUD_NAME="xxx"
CLOUDINARY_API_KEY="xxx"
CLOUDINARY_API_SECRET="xxx"
```

#### 3. Paiement Wave Sénégal
**Problème :** Paiement simulé en dev
**Action :**
```javascript
// Route à créer
POST /api/payments/wave/initiate → Créer lien paiement Wave
POST /api/payments/wave/confirm  → Confirmer paiement reçu
```
**API Wave :** https://wave.com/en/api

#### 4. Déploiement
**Backend :** Railway.app ou Render.com (gratuit)
**Frontend :** Vercel ou Netlify (gratuit)
**Base de données :** Supabase (PostgreSQL gratuit)
**Actions :**
```bash
# Backend
# 1. Créer compte Railway
# 2. Connecter GitHub
# 3. Deploy depuis repo
# 4. Configurer variables d'env

# Frontend
# 1. Créer compte Vercel
# 2. Upload les fichiers HTML
# 3. Changer API_URL dans api.js vers URL Railway
```

### 🟡 Priorité moyenne

#### 5. Page modifier produit
**Fichier à créer :** `marche-senegal-modifier-produit.html`
**Fonction :** Modifier un produit existant via `PUT /api/products/:id`
**Lien depuis :** `mes-produits.html` bouton "✏️ Modifier"

#### 6. Page ma boutique vendeur
**Fichier à créer :** `marche-senegal-ma-boutique.html`
**Fonction :** Modifier les infos de la boutique via `PUT /api/shops/me`

#### 7. Chat temps réel
**Socket.io déjà installé** dans le backend
**Action :**
- Activer les routes messages dans `server.js`
- Créer `marche-senegal-chat.html`
- Connecter Socket.io au frontend

#### 8. Avis clients
**Table `reviews` existe déjà** en base de données
**Action :**
- Créer `POST /api/reviews` dans le backend
- Ajouter formulaire d'avis dans `commande.html` après livraison

#### 9. Notifications SMS commande
**Action :**
- Envoyer SMS au vendeur quand nouvelle commande
- Envoyer SMS à l'acheteur quand statut change
- Utiliser Twilio dans `order.routes.js`

#### 10. Validation CNI admin
**Action :**
- Ajouter route `PATCH /api/admin/vendors/:id/verify`
- Permettre à l'admin d'approuver/refuser depuis `admin.html`
- Notifier le vendeur par SMS

### 🟢 Priorité basse

#### 11. Favoris fonctionnels
**Table `favorites` existe** en base de données
**Action :**
- Créer routes `/api/favorites`
- Connecter bouton ❤️ au frontend

#### 12. Promotions fonctionnelles
**Table `promotions` existe** en base de données
**Action :**
- Page `marche-senegal-promotions.html` pour vendeur
- Validation code promo dans le panier via API

#### 13. Statistiques avancées vendeur
**Action :**
- Graphiques de ventes dans dashboard
- Revenus par période
- Produits les plus vendus

---

## Variables d'environnement (.env)

```env
# Base de données
DATABASE_URL="postgresql://marche_user:marche2025@localhost:5432/marche_senegal"

# Serveur
PORT=3000
NODE_ENV="development"

# JWT
JWT_SECRET="marche_senegal_jwt_secret_2025"
JWT_EXPIRES_IN="7d"

# Twilio SMS — À CORRIGER
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="votre_auth_token_twilio"
TWILIO_PHONE_NUMBER="+1XXXXXXXXXX"

# Cloudinary Photos — À CONFIGURER
CLOUDINARY_CLOUD_NAME="mettre_plus_tard"
CLOUDINARY_API_KEY="mettre_plus_tard"
CLOUDINARY_API_SECRET="mettre_plus_tard"

# Frontend
FRONTEND_URL="http://127.0.0.1:5500"
```

---

## Comment démarrer le projet

### Backend
```bash
cd C:\Users\samb9\Desktop\marche-senegal-backend
npm run dev
# Serveur sur http://localhost:3000
```

### Frontend
```bash
# Ouvrir VS Code
cd C:\Users\samb9\Desktop\marche-senegal
# Clic droit sur marche-senegal-accueil.html
# → Open with Live Server
# Frontend sur http://127.0.0.1:5500
```

### Base de données
```bash
cd C:\Users\samb9\Desktop\marche-senegal-backend
npx prisma studio
# Interface visuelle sur http://localhost:5555
```

---

## Règles importantes pour Claude Code

1. **Ne jamais modifier `api.js`** sans vérifier que toutes les pages qui l'utilisent sont compatibles

2. **Toujours tester avec Thunder Client** avant de connecter au frontend

3. **Le frontend utilise vanilla JS** — pas de React, pas de Vue, pas de framework

4. **Prisma 5** — ne pas upgrader vers Prisma 7 (incompatible)

5. **CORS** — le frontend est sur `127.0.0.1:5500`, le backend sur `localhost:3000`

6. **Protection des routes** — utiliser `protect` + `restrictTo` du middleware

7. **Format des réponses API** — toujours retourner `{ success: true/false, data/message }`

8. **Les prix sont en FCFA** — toujours des entiers (pas de décimales)

9. **Les numéros sénégalais** — format `+221XXXXXXXXX`

10. **localStorage** — le panier et le token JWT sont stockés en localStorage

---

## Contact et contexte

- **Développeur :** Moustapha Samb (samb9702@gmail.com)
- **Projet :** Marché Sénégal — marketplace digitale sénégalaise
- **Objectif :** Digitaliser les marchés physiques du Sénégal
- **Marchés ciblés :** Sandaga, Tilène, HLM, Touba, Ziguinchor, Thiès
- **Paiements :** Wave, Orange Money, Free Money
- **Langue :** Français (interface), Wolof (futur)
