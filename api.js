// ════════════════════════════════════════
//   MARCHÉ SÉNÉGAL — Connexion à l'API
//   Ce fichier est utilisé par toutes
//   les pages HTML du frontend
// ════════════════════════════════════════

const API_URL = 'http://localhost:3000';

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
// UTILITAIRES
// ────────────────────────────────

// Formater un prix en FCFA
function formatPrice(price) {
  return price.toLocaleString('fr-FR') + ' FCFA';
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