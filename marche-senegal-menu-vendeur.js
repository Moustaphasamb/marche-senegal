// ══════════════════════════════════════════════════════════════════
// MENU VENDEUR — la barre latérale des six pages de l'espace vendeur
// ══════════════════════════════════════════════════════════════════
//
// Ce fichier est la seule source de vérité de la navigation vendeur.
// Avant lui, chaque page recopiait son propre <aside> : trois habillages
// et trois listes d'entrées différentes cohabitaient, et la messagerie
// était inatteignable depuis « Mes produits ».
//
// Il s'appuie sur api.js, qui doit être chargé avant : getCurrentUser(),
// majStatutSidebar(), getDashboard(), showToast() et logout().
// Les styles (.sidebar, .sb-item, .sb-badge…) vivent dans styles.css.

// Les entrées, dans l'ordre d'affichage. Une entrée a soit un « href »,
// soit une « action » ; jamais les deux.
const ENTREES_MENU_VENDEUR = [
  { section: 'Principal' },
  { cle: 'dashboard', icone: '📊', texte: 'Tableau de bord', href: 'marche-senegal-dashboard.html' },
  { cle: 'produits',  icone: '📦', texte: 'Mes produits',    href: 'marche-senegal-mes-produits.html',  badge: 'sb-badge-products',   badgeOr: true },
  { cle: 'commandes', icone: '🛒', texte: 'Mes commandes',   href: 'marche-senegal-mes-commandes.html', badge: 'sb-badge-orders' },
  { cle: 'promotions', icone: '🎯', texte: 'Promotions',     href: 'marche-senegal-dashboard.html#promotions', badge: 'sb-badge-promotions', badgeOr: true },

  { section: 'Boutique' },
  { cle: 'ajout',     icone: '➕', texte: 'Ajouter un produit', href: 'marche-senegal-ajout-produit.html' },
  { cle: 'boutique',  icone: '🏪', texte: 'Ma boutique',        href: 'marche-senegal-ma-boutique.html' },
  // Masquée tant que le vendeur n'a pas renseigné de visite virtuelle.
  { cle: 'visite',    icone: '🎥', texte: 'Visite virtuelle', action: ouvrirVisiteVirtuelle, id: 'sb-tour', masquee: true },
  { cle: 'messages',  icone: '💬', texte: 'Messages',         action: allerVersMessages, badge: 'sb-badge-messages' },
  { cle: 'avis',      icone: '⭐', texte: 'Avis clients',      href: 'marche-senegal-dashboard.html#avis' },
  { cle: 'revenus',   icone: '💰', texte: 'Mes revenus',       href: 'marche-senegal-mes-revenus.html' },

  { section: 'Compte' },
  // « Mon profil » menait à la page de l'acheteur (Favoris, Adresses, ses
  // propres commandes). « Ma boutique » tient déjà ce rôle pour un vendeur.
  { cle: 'voir',      icone: '🌐', texte: 'Voir ma boutique', action: voirMaBoutique },
];

// Quelle entrée s'allume selon la page ouverte. « Modifier un produit »
// n'a pas d'entrée à lui : on arrive toujours dessus depuis la liste.
const PAGE_VERS_ENTREE = {
  'marche-senegal-dashboard.html':        'dashboard',
  'marche-senegal-mes-produits.html':     'produits',
  'marche-senegal-modifier-produit.html': 'produits',
  'marche-senegal-mes-commandes.html':    'commandes',
  'marche-senegal-ajout-produit.html':    'ajout',
  'marche-senegal-ma-boutique.html':      'boutique',
  'marche-senegal-mes-revenus.html':     'revenus',
};

// ── Construction ──────────────────────────────────────────────────

function fichierCourant() {
  return window.location.pathname.split('/').pop() || 'marche-senegal-dashboard.html';
}

// L'entrée active tient compte du fragment : sur le tableau de bord,
// « #promotions » allume Promotions et non Tableau de bord.
function cleActiveCourante() {
  const fragment = window.location.hash.replace('#', '');
  if (fragment === 'promotions' || fragment === 'avis') return fragment;
  return PAGE_VERS_ENTREE[fichierCourant()] || '';
}

function construireEntree(entree) {
  const element = document.createElement(entree.href ? 'a' : 'div');
  element.className = 'sb-item';
  element.dataset.cle = entree.cle;
  if (entree.id) element.id = entree.id;
  if (entree.masquee) element.style.display = 'none';

  if (entree.href) element.href = entree.href;
  else element.addEventListener('click', entree.action);

  const icone = document.createElement('span');
  icone.className = 'sb-icon';
  icone.textContent = entree.icone;
  element.appendChild(icone);
  element.appendChild(document.createTextNode(entree.texte));

  if (entree.badge) {
    const badge = document.createElement('span');
    badge.className = entree.badgeOr ? 'sb-badge gold' : 'sb-badge';
    badge.id = entree.badge;
    badge.style.display = 'none';
    badge.textContent = '0';
    element.appendChild(badge);
  }

  return element;
}

function construireMenuVendeur() {
  if (document.getElementById('sidebar')) return; // déjà en place

  // Les styles de la barre vivent dans styles.css sous « body.espace-vendeur » :
  // les pages acheteur ont une barre du même nom qu'il ne faut pas toucher.
  document.body.classList.add('espace-vendeur');

  const voile = document.createElement('div');
  voile.className = 'sidebar-overlay';
  voile.id = 'sb-overlay';
  voile.addEventListener('click', closeSidebar);

  const barre = document.createElement('aside');
  barre.className = 'sidebar';
  barre.id = 'sidebar';
  barre.innerHTML =
    '<div class="sb-logo">' +
      '<div class="flag"><span class="fg"></span><span class="fy"></span><span class="fr"></span></div>' +
      '<span class="sb-logo-text">Marché Sénégal</span>' +
    '</div>' +
    '<div class="sb-shop">' +
      '<div class="sb-shop-row">' +
        '<div class="sb-avatar" id="sb-avatar">--</div>' +
        '<div>' +
          '<div class="sb-shop-name" id="sb-shop-name">Ma boutique</div>' +
          '<div class="sb-shop-status" id="sb-shop-status"><div class="sb-status-dot"></div><span>—</span></div>' +
          '<div class="sb-plan" id="sb-plan" style="display:none"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<nav class="sb-nav" id="sb-nav"></nav>' +
    '<div class="sb-bottom">' +
      '<div class="sb-logout" id="sb-logout"><span>🚪</span> Se déconnecter</div>' +
    '</div>';

  const navigation = barre.querySelector('#sb-nav');
  ENTREES_MENU_VENDEUR.forEach(entree => {
    if (entree.section) {
      const titre = document.createElement('div');
      titre.className = 'sb-section-label';
      titre.textContent = entree.section;
      navigation.appendChild(titre);
      return;
    }
    navigation.appendChild(construireEntree(entree));
  });

  barre.querySelector('#sb-logout').addEventListener('click', logoutVendeur);

  document.body.insertBefore(barre, document.body.firstChild);
  document.body.insertBefore(voile, document.body.firstChild);

  activerEntreeMenu(cleActiveCourante());
  remplirIdentiteMenu();

  // Sur le tableau de bord, changer de fragment change de section sans
  // recharger : il faut suivre le clic sur Promotions ou Avis clients.
  window.addEventListener('hashchange', () => {
    const cle = cleActiveCourante();
    activerEntreeMenu(cle);
    if (typeof showPage === 'function' && (cle === 'promotions' || cle === 'avis')) showPage(cle);
  });
}

// ── Mises à jour ──────────────────────────────────────────────────

function activerEntreeMenu(cle) {
  document.querySelectorAll('#sb-nav .sb-item').forEach(item => {
    item.classList.toggle('active', item.dataset.cle === cle);
  });
}

const LIBELLES_PLAN = { PRO: '⭐ Plan Pro', BUSINESS: '🚀 Plan Business', FREE: '🆓 Plan Gratuit' };

// Nom, initiales, état et plan de la boutique. Sans argument, ils sont
// lus dans la session : aucun appel réseau, la barre s'affiche remplie
// dès le premier rendu. Une page qui vient d'interroger le serveur passe
// sa boutique fraîche pour corriger ce que la session aurait de périmé.
function remplirIdentiteMenu(boutiqueFraiche) {
  const utilisateur = getCurrentUser();
  if (!utilisateur) return;

  const boutique = boutiqueFraiche || utilisateur.shop || {};
  const nom = boutique.name || 'Ma boutique';
  const nomComplet = [utilisateur.firstName, utilisateur.lastName].filter(Boolean).join(' ');
  const initiales = (nomComplet || nom).slice(0, 2).toUpperCase();

  const avatar = document.getElementById('sb-avatar');
  const nomBoutique = document.getElementById('sb-shop-name');
  if (avatar) avatar.textContent = initiales;
  if (nomBoutique) nomBoutique.textContent = nom;

  // Certaines pages gardent un rappel du vendeur dans leur barre du haut.
  const avatarHaut = document.getElementById('tb-av');
  const nomHaut = document.getElementById('tb-name');
  if (avatarHaut) avatarHaut.textContent = initiales;
  if (nomHaut) nomHaut.textContent = utilisateur.firstName || 'Vendeur';

  const plan = document.getElementById('sb-plan');
  if (plan) {
    const libelle = LIBELLES_PLAN[boutique.plan];
    plan.textContent = libelle || '';
    plan.style.display = libelle ? '' : 'none';
  }

  majStatutSidebar(boutique);
  majVisiteVirtuelleMenu(boutique);
}

// L'entrée n'apparaît que si le vendeur a renseigné un lien dans « Ma boutique ».
function majVisiteVirtuelleMenu(boutique) {
  const entree = document.getElementById('sb-tour');
  if (entree) entree.style.display = boutique?.virtualTourUrl ? '' : 'none';
}

// Les badges sont remplis par la page qui détient déjà les chiffres :
// aucune page ne paie un appel réseau supplémentaire pour le menu.
function majBadgeMenu(id, valeur) {
  const badge = document.getElementById(id);
  if (!badge) return;
  const nombre = Number(valeur) || 0;
  badge.textContent = nombre;
  badge.style.display = nombre > 0 ? '' : 'none';
}

// ── Actions ───────────────────────────────────────────────────────

// L'identifiant de la boutique vit dans la session. S'il manque — session
// ancienne, ou page ouverte avant le premier chargement — on le redemande
// au serveur plutôt que de renvoyer le vendeur sur l'accueil du site.
async function identifiantBoutique() {
  const depuisSession = getCurrentUser()?.shop?.id;
  if (depuisSession) return depuisSession;

  const reponse = await getDashboard();
  return reponse?.data?.shop?.id || null;
}

async function voirMaBoutique() {
  const id = await identifiantBoutique();
  if (id) window.location.href = 'marche-senegal-boutique.html?id=' + id;
  else showToast('Boutique introuvable — rechargez la page', 'error');
}

async function allerVersMessages() {
  const id = await identifiantBoutique();
  if (id) window.location.href = 'marche-senegal-chat.html?shopId=' + id;
  else showToast('Boutique introuvable — rechargez la page', 'error');
}

function ouvrirVisiteVirtuelle() {
  const lien = getCurrentUser()?.shop?.virtualTourUrl;
  if (lien) window.open(lien, '_blank', 'noopener');
  else showToast('Ajoutez le lien de votre visite virtuelle dans « Ma boutique »', 'error');
}

function logoutVendeur() {
  logout(); // logout() vide la session et redirige vers l'accueil
}

// ── Barre repliable sur téléphone ─────────────────────────────────

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sb-overlay')?.classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sb-overlay')?.classList.remove('show');
}

// ── Démarrage ─────────────────────────────────────────────────────
// Le script est chargé en fin de body, après api.js : le body existe,
// on construit tout de suite pour que la page ne clignote pas.

construireMenuVendeur();
