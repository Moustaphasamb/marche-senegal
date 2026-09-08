// ════════════════════════════════════════
//   MARCHÉ SÉNÉGAL — Connexion à l'API
//   Ce fichier est utilisé par toutes
//   les pages HTML du frontend
// ════════════════════════════════════════

const PROD_API_URL = 'https://marche-senegal-backend-production.up.railway.app';
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : PROD_API_URL;

// ────────────────────────────────
// Fonction principale pour appeler l'API
// ────────────────────────────────
async function apiCall(endpoint, options = {}) {
  try {
    // Récupérer le token de connexion s'il existe
    const token = localStorage.getItem('token');

    // Préparer les headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Ajouter le token si disponible
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Faire la requête
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    // Convertir la réponse en JSON
    const data = await response.json();

    // Session expirée → déconnexion automatique
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('connexion')) {
        window.location.href = 'marche-senegal-accueil.html';
      }
      return { success: false, message: 'Session expirée, veuillez vous reconnecter' };
    }

    return data;

  } catch (error) {
    console.error('Erreur API:', error);
    return { success: false, message: 'Erreur de connexion au serveur' };
  }
}

// ────────────────────────────────
// AUTHENTIFICATION
// ────────────────────────────────

// Envoyer le code OTP par SMS
async function sendOTP(phone) {
  return await apiCall('/api/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone })
  });
}

// Vérifier le code OTP et se connecter
async function verifyOTP(phone, code) {
  const result = await apiCall('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, code })
  });

  // Sauvegarder le token si connexion réussie
  if (result.success && result.token) {
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
  }

  return result;
}

// Récupérer l'utilisateur connecté
function getCurrentUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Vérifier si l'utilisateur est connecté
function isLoggedIn() {
  return localStorage.getItem('token') !== null;
}

// Se déconnecter
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'marche-senegal-accueil.html';
}

// ────────────────────────────────
// MARCHÉS
// ────────────────────────────────

// Récupérer tous les marchés
async function getMarkets(region = null) {
  const params = region ? `?region=${region}` : '';
  return await apiCall(`/api/markets${params}`);
}

// Récupérer un marché par son ID
async function getMarket(id) {
  return await apiCall(`/api/markets/${id}`);
}

// ────────────────────────────────
// PRODUITS
// ────────────────────────────────

// Récupérer les produits avec filtres
async function getProducts(filters = {}) {
  // Construire les paramètres de l'URL
  const params = new URLSearchParams();

  if (filters.q)          params.append('q', filters.q);
  if (filters.marketId)   params.append('marketId', filters.marketId);
  if (filters.categoryId) params.append('categoryId', filters.categoryId);
  if (filters.shopId)     params.append('shopId', filters.shopId);
  if (filters.minPrice)   params.append('minPrice', filters.minPrice);
  if (filters.maxPrice)   params.append('maxPrice', filters.maxPrice);
  if (filters.sortBy)     params.append('sortBy', filters.sortBy);
  if (filters.page)       params.append('page', filters.page);
  if (filters.limit)      params.append('limit', filters.limit);

  const query = params.toString() ? `?${params.toString()}` : '';
  return await apiCall(`/api/products${query}`);
}

// Récupérer un produit par son ID
async function getProduct(id) {
  return await apiCall(`/api/products/${id}`);
}

// Récupérer tous mes produits (vendeur — sans filtre stock)
async function getMyProducts() {
  return await apiCall('/api/shops/products');
}

// Créer un produit (vendeur)
async function createProduct(productData) {
  return await apiCall('/api/products', {
    method: 'POST',
    body: JSON.stringify(productData)
  });
}

// Modifier un produit (vendeur)
async function updateProduct(id, productData) {
  return await apiCall(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(productData)
  });
}

// ────────────────────────────────
// BOUTIQUES
// ────────────────────────────────

// Récupérer les boutiques avec filtres
async function getShops(filters = {}) {
  const params = new URLSearchParams();

  if (filters.marketId) params.append('marketId', filters.marketId);
  if (filters.rating)   params.append('rating', filters.rating);
  if (filters.page)     params.append('page', filters.page);

  const query = params.toString() ? `?${params.toString()}` : '';
  return await apiCall(`/api/shops${query}`);
}

// Récupérer une boutique par son ID
async function getShop(id) {
  return await apiCall(`/api/shops/${id}`);
}

// Récupérer le dashboard du vendeur connecté
async function getDashboard() {
  return await apiCall('/api/shops/dashboard');
}

// Récupérer toutes les commandes du vendeur
async function getShopOrders() {
  return await apiCall('/api/shops/orders');
}

// ────────────────────────────────
// COMMANDES
// ────────────────────────────────

// Passer une commande
async function createOrder(orderData) {
  return await apiCall('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });
}

// Récupérer mes commandes
async function getMyOrders() {
  return await apiCall('/api/orders/me');
}

// Récupérer une commande par son ID
async function getOrder(id) {
  return await apiCall(`/api/orders/${id}`);
}

// Changer le statut d'une commande
async function updateOrderStatus(id, status) {
  return await apiCall(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

// ────────────────────────────────
// PROFIL
// ────────────────────────────────

async function updateProfile(data) {
  return await apiCall('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

// ────────────────────────────────
// ADRESSES
// ────────────────────────────────

async function getAddresses() {
  return await apiCall('/api/addresses');
}

async function createAddress(data) {
  return await apiCall('/api/addresses', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function updateAddress(id, data) {
  return await apiCall('/api/addresses/' + id, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function deleteAddress(id) {
  return await apiCall('/api/addresses/' + id, { method: 'DELETE' });
}

async function setDefaultAddress(id) {
  return await apiCall('/api/addresses/' + id + '/default', { method: 'PATCH' });
}

// ────────────────────────────────
// FAVORIS
// ────────────────────────────────

async function getFavorites() {
  return await apiCall('/api/favorites');
}

async function addFavorite(productId) {
  return await apiCall('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ productId })
  });
}

async function removeFavorite(productId) {
  return await apiCall('/api/favorites/' + productId, { method: 'DELETE' });
}

async function checkFavorite(productId) {
  return await apiCall('/api/favorites/check/' + productId);
}

// ────────────────────────────────
// PROMOTIONS
// ────────────────────────────────

async function getMyPromotions() {
  return await apiCall('/api/promotions/mine');
}

async function createPromotion(data) {
  return await apiCall('/api/promotions', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function togglePromotion(id) {
  return await apiCall('/api/promotions/' + id + '/toggle', { method: 'PATCH' });
}

async function deletePromotion(id) {
  return await apiCall('/api/promotions/' + id, { method: 'DELETE' });
}

async function validatePromoCode(code, shopId, amount) {
  return await apiCall('/api/promotions/validate', {
    method: 'POST',
    body: JSON.stringify({ code, shopId, amount })
  });
}

// ────────────────────────────────
// AVIS CLIENTS
// ────────────────────────────────

async function createReview(data) {
  return await apiCall('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function getShopReviews(shopId, page = 1) {
  return await apiCall(`/api/reviews/shop/${shopId}?page=${page}`);
}

async function getProductReviews(productId) {
  return await apiCall(`/api/reviews/product/${productId}`);
}

// ────────────────────────────────
// CHAT / MESSAGES
// ────────────────────────────────

async function getChatMessages(shopId) {
  return await apiCall(`/api/messages/${shopId}`);
}

async function sendChatMessage(shopId, content) {
  return await apiCall(`/api/messages/${shopId}`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

async function markMessagesRead(shopId) {
  return await apiCall(`/api/messages/${shopId}/read`, { method: 'PATCH' });
}

// ────────────────────────────────
// STATISTIQUES VENDEUR
// ────────────────────────────────

async function getShopStats(period) {
  return await apiCall('/api/shops/stats?period=' + (period || '7d'));
}

// ────────────────────────────────
// BANNIÈRES
// ────────────────────────────────

// Visuel de repli tant que les vraies bannières ne sont pas produites.
// Il porte la mention « VISUEL TEMPORAIRE » : si tu le vois en ligne,
// c'est qu'une image manque encore.
// Rangé dans assets/ et non dans files/, qui est exclu par le .gitignore
// et ne serait donc jamais déployé.
const BANNER_PLACEHOLDER = 'assets/banner-placeholder.svg';

// Crédits des bannières. Deux régimes coexistent :
//
//  · les PHOTOS des marchés qui en ont une, sous licence Creative Commons —
//    l'attribution n'est pas optionnelle, c'est la contrepartie de la
//    réutilisation libre ;
//  · les ILLUSTRATIONS par type de marché, que nous avons produites. Elles
//    portent la mention « Illustration » afin que personne ne les prenne pour
//    une photographie du marché consulté.
//
// La clé est le chemin exact stocké dans Market.imageUrl. Une image absente de
// cette table n'affiche aucune mention.
const CREDITS_BANNIERES = {
  'assets/marche-sandaga.jpg':  { texte: 'Photo : Balou46 · CC BY-SA 4.0',              page: 'https://commons.wikimedia.org/wiki/File:SN-dakar-sandaga-1.jpg' },
  'assets/marche-kermel.jpg':   { texte: 'Photo : Balou46 · CC BY-SA 4.0',              page: 'https://commons.wikimedia.org/wiki/File:SN-dakar-marche-kermel-1.jpg' },
  'assets/marche-thies.jpg':    { texte: 'Photo : GastelEtzwane · CC BY-SA 4.0',        page: 'https://commons.wikimedia.org/wiki/File:Marché_de_Thiès.jpg' },
  'assets/marche-mbour.jpg':    { texte: 'Photo : Le troisième oeil · CC BY-SA 4.0',    page: 'https://commons.wikimedia.org/wiki/File:Marché_de_Mbour.jpg' },
  'assets/marche-rufisque.jpg': { texte: 'Photo : Habobe2020 · CC BY-SA 4.0',           page: 'https://commons.wikimedia.org/wiki/File:Image_représentant_des_étalages_au_marché_central_de_Rufisque_Dakar,_Sénégal.jpg' },
  'assets/marche-touba.jpg':    { texte: 'Photo : ho visto nina volare · CC BY-SA 2.0', page: 'https://commons.wikimedia.org/wiki/File:ToubaMarché.jpg' },

  'assets/type-urbain.jpg':       { texte: 'Illustration · marché urbain' },
  'assets/type-poisson.jpg':      { texte: 'Illustration · marché de pêche' },
  'assets/type-betail.jpg':       { texte: 'Illustration · marché sahélien' },
  'assets/type-ville-sainte.jpg': { texte: 'Illustration · marché de ville sainte' },
  'assets/type-fleuve.jpg':       { texte: 'Illustration · marché du fleuve' },
  'assets/type-casamance.jpg':    { texte: 'Illustration · marché de Casamance' },
  'assets/type-arachide.jpg':     { texte: 'Illustration · marché du bassin arachidier' },
  'assets/type-oriental.jpg':     { texte: 'Illustration · marché du Sénégal oriental' }
};

// Le style de la mention est injecté une seule fois, ici plutôt que dans chaque
// page : api.js est partagé, les feuilles de style des pages ne le sont pas.
function injecterStyleCredit() {
  if (document.getElementById('style-credit-banniere')) return;
  const s = document.createElement('style');
  s.id = 'style-credit-banniere';
  s.textContent =
    '.banner-credit{position:absolute;right:10px;bottom:8px;z-index:3;font-size:.64rem;line-height:1.3;' +
    'color:rgba(255,255,255,.66);text-decoration:none;background:rgba(0,0,0,.32);padding:3px 9px;border-radius:99px}' +
    'a.banner-credit:hover,a.banner-credit:focus-visible{color:#fff;text-decoration:underline}';
  document.head.appendChild(s);
}

// Applique une image de fond à une section sombre (hero, en-tête de marché).
// Le voile foncé fait partie du background-image plutôt que d'un ::before,
// pour ne pas entrer en conflit avec les pseudo-éléments décoratifs déjà
// présents sur .hero et .market-hero.
//
//   el      : l'élément à habiller
//   url     : l'image réelle (market.imageUrl, shop.bannerUrl…) ou null
//   options : { focus: 'left' | 'center' } — 'left' assombrit davantage la
//             gauche pour garder le titre lisible par-dessus la photo.
function applyBanner(el, url, options = {}) {
  if (!el) return;

  const { focus = 'center' } = options;
  const image = url || BANNER_PLACEHOLDER;
  const isPlaceholder = !url;

  const veil = focus === 'left'
    ? 'linear-gradient(100deg, rgba(13,31,23,.94) 0%, rgba(13,31,23,.82) 42%, rgba(13,31,23,.58) 100%)'
    : 'linear-gradient(rgba(13,31,23,.78), rgba(13,31,23,.86))';

  // Les guillemets encadrent l'URL : un nom de fichier avec espaces ou
  // parenthèses casserait sinon la propriété CSS.
  el.style.backgroundImage = `${veil}, url("${String(image).replace(/"/g, '%22')}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';

  // Repère lisible dans l'inspecteur et exploitable en CSS si besoin.
  el.dataset.banner = isPlaceholder ? 'placeholder' : 'real';


  // Mention de la bannière : attribution obligatoire pour les photos sous
  // licence, mention « Illustration » pour nos propres visuels afin qu'ils ne
  // soient pas pris pour une photographie du lieu. On retire l'ancienne avant
  // d'en poser une nouvelle, sans quoi deux appels les empileraient.
  el.querySelector(':scope > .banner-credit')?.remove();
  const credit = CREDITS_BANNIERES[url];
  if (credit) {
    injecterStyleCredit();
    // Un lien lorsqu'il y a une source à citer, un simple texte sinon.
    const mention = document.createElement(credit.page ? 'a' : 'span');
    mention.className = 'banner-credit';
    if (credit.page) {
      mention.href = credit.page;
      mention.target = '_blank';
      mention.rel = 'noopener noreferrer license';
    }
    mention.textContent = credit.texte;
    el.appendChild(mention);
  }

  if (isPlaceholder) {
    console.info('[bannière] visuel temporaire utilisé —', el.className || el.tagName);
  }
}

// ────────────────────────────────
// UTILITAIRES
// ────────────────────────────────

// Échapper les caractères HTML pour prévenir les injections XSS
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formater un prix en FCFA
function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return Number(price).toLocaleString('fr-FR') + ' FCFA';
}

// Afficher un message toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (type === 'error') toast.style.background = 'var(--red)';
  else toast.style.background = 'var(--dark)';
  setTimeout(() => {
    toast.classList.remove('show');
    toast.style.background = '';
  }, 3000);
}

// Afficher un état de chargement
function showLoading(containerId, message = 'Chargement...') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--muted)">
      <div style="font-size:2rem;margin-bottom:10px">⏳</div>
      <div>${message}</div>
    </div>
  `;
}

// Afficher une erreur
function showError(containerId, message = 'Erreur de chargement') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--red)">
      <div style="font-size:2rem;margin-bottom:10px">❌</div>
      <div>${message}</div>
    </div>
  `;
}