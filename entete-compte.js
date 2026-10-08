// En-tête : le bouton de compte et le lien vendeur suivent la personne connectée.
// Sans lui, boutique et produit affichaient « Se connecter » même connecté, et un
// vendeur connecté voyait encore « Devenir vendeur » sur l'accueil.
(function (root) {
  'use strict';

  const ESPACE = {
    SELLER: 'marche-senegal-dashboard.html',
    ADMIN: 'marche-senegal-admin.html',
    BUYER: 'marche-senegal-profil.html'
  };

  function cible(user) {
    if (!user || !user.role) return { texte: 'Se connecter', lien: 'marche-senegal-connexion-acheteur.html' };
    return { texte: user.firstName || 'Mon compte', lien: ESPACE[user.role] || ESPACE.BUYER };
  }

  function lienVendeur(user) {
    return user && user.role === 'SELLER'
      ? { texte: 'Mon espace vendeur', lien: ESPACE.SELLER }
      : { texte: 'Devenir vendeur', lien: 'marche-senegal-connexion-vendeur.html' };
  }

  function appliquer(doc, user) {
    const compte = cible(user);
    doc.querySelectorAll('.nav-btn-login, .nav-drawer-row .nav-btn').forEach(bouton => {
      bouton.textContent = compte.texte;
      bouton.dataset.lien = compte.lien;
      bouton.onclick = () => { root.location.href = compte.lien; };
    });
    const vendeur = lienVendeur(user);
    doc.querySelectorAll('.nav-seller-link').forEach(lien => {
      lien.setAttribute('href', vendeur.lien);
      // Seul le texte change : la flèche décorative reste en place.
      const texte = [...lien.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (texte) texte.textContent = vendeur.texte + ' ';
    });
  }

  function utilisateur() {
    try { return typeof root.getCurrentUser === 'function' ? root.getCurrentUser() : null; } catch { return null; }
  }

  const api = { cible, lienVendeur, appliquer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.EnteteCompte = api;
    const lancer = () => appliquer(root.document, utilisateur());
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', lancer);
    else lancer();
  }
})(typeof window !== 'undefined' ? window : globalThis);
