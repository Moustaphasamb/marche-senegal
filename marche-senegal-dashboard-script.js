// ════════════════════════════════════════
//   DASHBOARD VENDEUR — Données dynamiques
// ════════════════════════════════════════

// ── Toast (alias pour les onclick inline du HTML) ──
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Helper DOM ──
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function setEmpty(container, text, asTableRow, colspan) {
  if (asTableRow) {
    const tr = mk('tr');
    const td = mk('td', '', text);
    td.colSpan = colspan || 1;
    td.style.cssText = 'text-align:center;padding:24px;color:var(--muted)';
    tr.appendChild(td);
    container.replaceChildren(tr);
  } else {
    const div = mk('div', '', text);
    div.style.cssText = 'text-align:center;padding:24px;color:var(--muted)';
    container.replaceChildren(div);
  }
}

// ── Helpers statut ──
function getStatusClass(status) {
  const map = { PENDING:'os-wait', CONFIRMED:'os-go', PREPARING:'os-go', DELIVERING:'os-go', DELIVERED:'os-done', CANCELLED:'os-cancel' };
  return map[status] || 'os-wait';
}
function getStatusLabel(status) {
  const map = { PENDING:'En attente', CONFIRMED:'Confirmé', PREPARING:'En préparation', DELIVERING:'En livraison', DELIVERED:'Livré', CANCELLED:'Annulé' };
  return map[status] || status;
}
function formatDate(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (m < 2) return 'À l\'instant';
  if (m < 60) return 'Il y a ' + m + ' min';
  if (h < 24) return 'Il y a ' + h + 'h';
  if (d === 1) return 'Hier';
  return 'Il y a ' + d + ' jours';
}
function makeImg(images, size) {
  const div = mk('div');
  div.style.cssText = 'width:' + size + ';height:' + size + ';border-radius:7px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:1.2rem;border:1px solid var(--border);flex-shrink:0;overflow:hidden';
  if (images && images.length > 0) {
    const img = mk('img');
    img.src = images[0];
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    div.appendChild(img);
  } else {
    div.textContent = '👗';
  }
  return div;
}

// ── Charger le dashboard principal ──
async function loadDashboard() {
  const result = await getDashboard();
  if (!result.success) {
    window.location.href = 'marche-senegal-connexion-vendeur.html';
    return;
  }

  const { shop, seller, stats, recentOrders, topProducts, lowStock } = result.data;
  const fullName = [seller.firstName, seller.lastName].filter(Boolean).join(' ');
  const initials = [seller.firstName, seller.lastName].filter(Boolean).map(n => n[0].toUpperCase()).join('');

  // Mettre à jour localStorage avec shopId
  const storedUser = getCurrentUser();
  if (storedUser) {
    storedUser.firstName = seller.firstName;
    storedUser.lastName  = seller.lastName;
    storedUser.shop      = shop;
    localStorage.setItem('user', JSON.stringify(storedUser));
  }

  // Topbar
  const tbName = document.querySelector('.tb-profile-name');
  if (tbName) tbName.textContent = fullName || shop.name;
  const tbAv = document.querySelector('.tb-profile-av');
  if (tbAv) tbAv.textContent = initials || shop.name.substring(0,2).toUpperCase();

  // Sidebar
  const sbAv = document.querySelector('.sb-avatar');
  if (sbAv) sbAv.textContent = initials || shop.name.substring(0,2).toUpperCase();
  const sbShopName = document.querySelector('.sb-shop-name');
  if (sbShopName) sbShopName.textContent = shop.name;
  const sbPlan = document.querySelector('.sb-plan');
  if (sbPlan) sbPlan.textContent = shop.plan === 'PRO' ? '⭐ Plan Pro' : shop.plan === 'BUSINESS' ? '🚀 Plan Business' : '🆓 Plan Gratuit';

  // Welcome bar
  const wbName = document.querySelector('.wb-name');
  if (wbName) wbName.textContent = fullName || shop.name;
  const wbMarket = document.querySelector('.wb-market');
  if (wbMarket && shop.market) {
    const badge = wbMarket.querySelector('.wb-open');
    wbMarket.textContent = '🏛️ ' + shop.market.name;
    if (badge) wbMarket.appendChild(badge);
  }

  // KPIs
  const kpiVals = document.querySelectorAll('.kpi-val');
  if (kpiVals[0]) kpiVals[0].textContent = stats.totalRevenue > 0 ? stats.totalRevenue.toLocaleString('fr-FR') : '0';
  if (kpiVals[1]) kpiVals[1].textContent = stats.totalOrders;
  if (kpiVals[2]) kpiVals[2].textContent = stats.totalProducts;
  if (kpiVals[3]) kpiVals[3].textContent = shop.rating > 0 ? shop.rating.toFixed(1) : 'Nouveau';
  const kpi0sub = document.getElementById('kpi0-sub');
  if (kpi0sub) kpi0sub.textContent = stats.totalOrders + ' commandes au total';
  const kpi1sub = document.getElementById('kpi1-sub');
  if (kpi1sub) kpi1sub.textContent = stats.pendingOrders + ' en attente';
  const kpi2sub = document.getElementById('kpi2-sub');
  if (kpi2sub) kpi2sub.textContent = stats.totalProducts > 0 ? 'dans votre boutique' : 'Ajoutez votre premier produit';

  // Badges sidebar
  const sbBadgeProducts = document.getElementById('sb-badge-products');
  if (sbBadgeProducts) sbBadgeProducts.textContent = stats.totalProducts;
  const sbBadgeOrders = document.getElementById('sb-badge-orders');
  if (sbBadgeOrders) sbBadgeOrders.textContent = stats.pendingOrders || 0;

  // Lien boutique
  const sbSeeShop = document.getElementById('sb-see-shop');
  if (sbSeeShop && shop.id) sbSeeShop.onclick = () => window.location.href = 'marche-senegal-boutique.html?id=' + shop.id;

  // Boutique non validée
  if (shop.status === 'PENDING') showToast('⚠️ Boutique en attente de validation CNI', 'error');

  // ── Commandes récentes (tableau) ──
  const ordersTable = document.querySelector('.orders-table tbody');
  if (ordersTable) {
    if (!recentOrders.length) {
      setEmpty(ordersTable, 'Aucune commande pour le moment', true, 5);
    } else {
      const frag = document.createDocumentFragment();
      recentOrders.forEach(order => {
        const tr = mk('tr');
        const itemName = order.items && order.items.length > 0
          ? (order.items[0].productName || order.items[0].name || order.items.length + ' article(s)')
          : '—';
        const td1 = mk('td', '', order.buyer ? order.buyer.firstName : 'Client');
        const td2 = mk('td', '', itemName);
        const td3 = mk('td', '', formatPrice(order.total));
        td3.style.cssText = 'font-weight:600;color:var(--green)';
        const td4 = mk('td');
        const statusSpan = mk('span', 'order-status ' + getStatusClass(order.status), getStatusLabel(order.status));
        td4.appendChild(statusSpan);
        const td5 = mk('td');
        const actionSpan = mk('span', 'order-action', 'Voir →');
        actionSpan.onclick = () => showPage('commandes', null);
        td5.appendChild(actionSpan);
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4); tr.appendChild(td5);
        frag.appendChild(tr);
      });
      ordersTable.replaceChildren(frag);
    }
  }

  // ── Top produits ──
  const prodList = document.querySelector('.prod-list');
  if (prodList) {
    if (!topProducts.length) {
      setEmpty(prodList, 'Aucun produit pour le moment');
    } else {
      const frag = document.createDocumentFragment();
      topProducts.forEach((prod, i) => {
        const row = mk('div', 'prod-row');
        const rank = mk('div', 'pr-rank' + (i === 0 ? ' gold' : ''), String(i + 1));
        const img = makeImg(prod.images, '40px');
        img.className = 'pr-img';
        const info = mk('div', 'pr-info');
        info.appendChild(mk('div', 'pr-name', prod.name));
        info.appendChild(mk('div', 'pr-cat', prod.category ? prod.category.name : '—'));
        const right = mk('div', 'pr-right');
        right.appendChild(mk('div', 'pr-sold', prod.totalSales + ' ventes'));
        right.appendChild(mk('div', 'pr-rev', formatPrice(prod.price * prod.totalSales)));
        row.appendChild(rank); row.appendChild(img); row.appendChild(info); row.appendChild(right);
        frag.appendChild(row);
      });
      prodList.replaceChildren(frag);
    }
  }

  // ── Alertes stock ──
  const stockList = document.querySelector('.stock-list');
  if (stockList) {
    if (!lowStock.length) {
      setEmpty(stockList, '✅ Tous vos produits ont un stock suffisant');
    } else {
      const frag = document.createDocumentFragment();
      lowStock.forEach(prod => {
        const item = mk('div', 'stock-item');
        const imgDiv = makeImg(prod.images, '36px');
        imgDiv.className = 'st-img';
        const info = mk('div', 'st-info');
        info.appendChild(mk('div', 'st-name', prod.name));
        info.appendChild(mk('div', 'st-stock', prod.stock + ' pièce(s) restante(s)'));
        const badge = mk('span', 'st-badge ' + (prod.stock === 0 ? 'stb-out' : 'stb-low'), prod.stock === 0 ? 'Rupture' : 'Stock faible');
        const action = mk('span', 'st-action', '+ Stock');
        action.onclick = () => window.location.href = 'marche-senegal-mes-produits.html';
        item.appendChild(imgDiv); item.appendChild(info); item.appendChild(badge); item.appendChild(action);
        frag.appendChild(item);
      });
      stockList.replaceChildren(frag);
    }
  }

  // ── Activité récente ──
  const actList = document.querySelector('.activity-list');
  if (actList && recentOrders.length > 0) {
    const frag = document.createDocumentFragment();
    recentOrders.slice(0, 5).forEach(order => {
      const item = mk('div', 'act-item');
      const icon = mk('div', 'act-icon ai-green', '🛒');
      const text = mk('div', 'act-text');
      const strong = mk('strong', '', getStatusLabel(order.status));
      text.appendChild(strong);
      text.appendChild(document.createTextNode(' — ' + (order.buyer ? order.buyer.firstName : 'Client') + ' · ' + formatPrice(order.total)));
      const time = mk('div', 'act-time', formatDate(order.createdAt));
      item.appendChild(icon); item.appendChild(text); item.appendChild(time);
      frag.appendChild(item);
    });
    actList.replaceChildren(frag);
  }
}

// ── Section "Mes produits" (onglet interne) ──
async function loadMyProducts() {
  const result = await getMyProducts();
  if (!result.success) return;
  const products = result.data;

  const filterBtns = document.querySelectorAll('#page-produits .filter-btn');
  if (filterBtns[0]) filterBtns[0].textContent = 'Tous (' + products.length + ')';
  if (filterBtns[1]) filterBtns[1].textContent = 'Actifs (' + products.filter(p => p.status === 'ACTIVE').length + ')';
  if (filterBtns[2]) filterBtns[2].textContent = 'En pause (' + products.filter(p => p.status === 'PAUSED').length + ')';
  if (filterBtns[3]) filterBtns[3].textContent = 'Rupture (' + products.filter(p => p.stock === 0).length + ')';

  const tbody = document.querySelector('#page-produits .prod-table tbody');
  if (!tbody) return;

  if (!products.length) {
    const tr = mk('tr');
    const td = mk('td', '', 'Aucun produit — ');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;padding:32px;color:var(--muted)';
    const link = mk('a', '', 'Ajouter votre premier produit →');
    link.href = 'marche-senegal-ajout-produit.html';
    link.style.cssText = 'color:var(--green);font-weight:600';
    td.appendChild(link);
    tr.appendChild(td);
    tbody.replaceChildren(tr);
    return;
  }

  const frag = document.createDocumentFragment();
  products.forEach(prod => {
    const tr = mk('tr');

    // Colonne image + nom
    const td1 = mk('td');
    const wrap = mk('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:10px';
    const imgDiv = makeImg(prod.images, '44px'); imgDiv.className = 'pt-img';
    const nameWrap = mk('div');
    nameWrap.appendChild(mk('div', 'pt-name', prod.name));
    nameWrap.appendChild(mk('div', 'pt-cat', prod.category ? prod.category.name : '—'));
    wrap.appendChild(imgDiv); wrap.appendChild(nameWrap);
    td1.appendChild(wrap);

    // Prix
    const td2 = mk('td', '', formatPrice(prod.price)); td2.style.fontWeight = '600';

    // Stock
    const stockClass = prod.stock === 0 ? 'pt-stock-out' : prod.stock <= 5 ? 'pt-stock-low' : 'pt-stock-ok';
    const td3 = mk('td', stockClass, prod.stock === 0 ? '0 — Rupture' : prod.stock + ' restant(s)');

    // Ventes
    const td4 = mk('td', '', prod.totalSales + ' ventes');

    // Statut
    const td5 = mk('td');
    td5.appendChild(mk('span', 'pt-status ' + (prod.status === 'ACTIVE' ? 'pts-active' : 'pts-paused'), prod.status === 'ACTIVE' ? 'Actif' : 'En pause'));

    // Actions
    const td6 = mk('td');
    const actDiv = mk('div', 'pt-actions');
    const editBtn = mk('button', 'pta-btn', '✏️');
    editBtn.onclick = () => window.location.href = 'marche-senegal-modifier-produit.html?id=' + prod.id;
    const delBtn = mk('button', 'pta-btn del', '🗑️');
    delBtn.onclick = () => deleteProd(prod.id);
    actDiv.appendChild(editBtn); actDiv.appendChild(delBtn);
    td6.appendChild(actDiv);

    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    tr.appendChild(td4); tr.appendChild(td5); tr.appendChild(td6);
    frag.appendChild(tr);
  });
  tbody.replaceChildren(frag);
}

async function deleteProd(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  const result = await apiCall('/api/products/' + id, { method: 'DELETE' });
  if (result.success) { showToast('Produit supprimé'); loadMyProducts(); }
  else showToast('Erreur lors de la suppression', 'error');
}

// ── Section "Commandes" (onglet interne) ──
async function loadMyOrders() {
  const result = await getShopOrders();
  if (!result.success) return;
  const orders = result.data;

  const filterBtns = document.querySelectorAll('#page-commandes .of-btn');
  if (filterBtns[0]) filterBtns[0].textContent = 'Toutes (' + orders.length + ')';
  if (filterBtns[1]) filterBtns[1].textContent = 'En attente (' + orders.filter(o => o.status === 'PENDING').length + ')';
  if (filterBtns[2]) filterBtns[2].textContent = 'En livraison (' + orders.filter(o => o.status === 'DELIVERING').length + ')';
  if (filterBtns[3]) filterBtns[3].textContent = 'Livrées (' + orders.filter(o => o.status === 'DELIVERED').length + ')';
  if (filterBtns[4]) filterBtns[4].textContent = 'Annulées (' + orders.filter(o => o.status === 'CANCELLED').length + ')';

  const phSub = document.querySelector('#page-commandes .page-header div:last-child');
  if (phSub) phSub.textContent = orders.filter(o => o.status === 'PENDING').length + ' commande(s) en attente';

  const container = document.querySelector('.order-cards');
  if (!container) return;

  if (!orders.length) {
    setEmpty(container, 'Aucune commande pour le moment');
    return;
  }

  const frag = document.createDocumentFragment();
  orders.slice(0, 30).forEach(order => {
    const card = mk('div', 'order-card');

    // Header
    const header = mk('div', 'oc-header');
    header.appendChild(mk('div', 'oc-num', '#' + order.id.substring(0,8).toUpperCase()));
    header.appendChild(mk('div', 'oc-date', formatDate(order.createdAt)));
    header.appendChild(mk('div', 'oc-status ' + getStatusClass(order.status), getStatusLabel(order.status)));

    // Body
    const body = mk('div', 'oc-body');
    const items = mk('div', 'oc-items');
    items.appendChild(mk('div', 'oc-item-img', '👗'));
    const info = mk('div', 'oc-info');
    const client = mk('div', 'oc-client', (order.buyer ? order.buyer.firstName : 'Client') + ' · 📱 ' + (order.buyer ? order.buyer.phone : '—'));
    const detail = mk('div', 'oc-detail', (order.items ? order.items.length : 1) + ' article(s)');
    info.appendChild(client); info.appendChild(detail);
    const amount = mk('div', 'oc-amount', formatPrice(order.total));
    body.appendChild(items); body.appendChild(info); body.appendChild(amount);

    // Actions
    const actions = mk('div', 'oc-actions');
    if (order.status === 'PENDING') {
      const btn = mk('button', 'oca-btn oca-btn-primary', '✓ Confirmer');
      btn.onclick = () => changeOrderStatus(order.id, 'CONFIRMED');
      actions.appendChild(btn);
    }
    if (order.status === 'CONFIRMED') {
      const btn = mk('button', 'oca-btn oca-btn-primary', '📦 En préparation');
      btn.onclick = () => changeOrderStatus(order.id, 'PREPARING');
      actions.appendChild(btn);
    }
    if (order.status === 'PREPARING') {
      const btn = mk('button', 'oca-btn oca-btn-primary', '🚚 Envoyer');
      btn.onclick = () => changeOrderStatus(order.id, 'DELIVERING');
      actions.appendChild(btn);
    }
    const detailBtn = mk('button', 'oca-btn', 'Détails →');
    detailBtn.onclick = () => window.location.href = 'marche-senegal-mes-commandes.html';
    actions.appendChild(detailBtn);

    card.appendChild(header); card.appendChild(body); card.appendChild(actions);
    frag.appendChild(card);
  });
  container.replaceChildren(frag);
}

async function changeOrderStatus(orderId, status) {
  const result = await updateOrderStatus(orderId, status);
  if (result.success) { showToast('✓ Statut mis à jour'); loadMyOrders(); loadDashboard(); }
  else showToast('Erreur', 'error');
}

// ════════════════════════════════════════
//   PROMOTIONS — Données réelles
// ════════════════════════════════════════

const PROMO_TYPE_INFO = {
  CODE:          { icon: '🏷️', label: 'Code promo',        cls: 'code'  },
  SALE:          { icon: '💸', label: 'Soldes',             cls: 'solde' },
  OFFER:         { icon: '🎁', label: 'Offre spéciale',     cls: 'offre' },
  ANNOUNCEMENT:  { icon: '📢', label: 'Annonce',            cls: 'code'  },
  FEATURED:      { icon: '⭐', label: 'Produit vedette',    cls: 'code'  },
  FREE_DELIVERY: { icon: '🚚', label: 'Livraison gratuite', cls: 'code'  }
};

async function loadPromotions() {
  const promoList = document.getElementById('promo-list');
  const countLabel = document.getElementById('promo-count-label');
  if (!promoList) return;

  const result = await getMyPromotions();
  if (!result.success) {
    setEmpty(promoList, 'Impossible de charger les promotions');
    return;
  }

  const promos = result.data;
  const activeCount = promos.filter(p => p.isActive).length;
  if (countLabel) countLabel.textContent = 'Promotions actives (' + activeCount + ')';

  if (!promos.length) {
    setEmpty(promoList, 'Aucune promotion — créez votre première ci-dessous');
    return;
  }

  const frag = document.createDocumentFragment();
  promos.forEach(promo => {
    const info = PROMO_TYPE_INFO[promo.type] || PROMO_TYPE_INFO.CODE;
    const daysLeft = promo.endDate
      ? Math.max(0, Math.ceil((new Date(promo.endDate) - Date.now()) / 86400000))
      : null;
    const isActive = promo.isActive && (daysLeft === null || daysLeft > 0);

    const card = mk('div', 'promo-card-item');

    const header = mk('div', 'pci-header');
    header.appendChild(mk('div', 'pci-type ' + info.cls, info.icon + ' ' + info.label));
    header.appendChild(mk('div', 'pci-status ' + (isActive ? 'pci-active' : 'pci-expired'), isActive ? '● Actif' : '○ Inactif'));
    card.appendChild(header);

    card.appendChild(mk('div', 'pci-code', promo.code || promo.title));

    let descText = '-' + promo.discount + '% de réduction';
    if (promo.maxUses) descText += ' · Max ' + promo.maxUses + ' utilisations';
    if (daysLeft !== null) descText += daysLeft > 0 ? ' · ' + daysLeft + ' jour(s) restant(s)' : ' · Expiré';
    card.appendChild(mk('div', 'pci-desc', descText));

    const stats = mk('div', 'pci-stats');
    const s1 = mk('div');
    s1.appendChild(mk('div', 'pcis-val', promo.maxUses ? promo.usedCount + '/' + promo.maxUses : String(promo.usedCount)));
    s1.appendChild(mk('div', 'pcis-lbl', 'Utilisations'));
    const s2 = mk('div');
    s2.appendChild(mk('div', 'pcis-val', daysLeft !== null ? daysLeft + ' j.' : '∞'));
    s2.appendChild(mk('div', 'pcis-lbl', 'Restants'));
    stats.appendChild(s1); stats.appendChild(s2);
    card.appendChild(stats);

    const actions = mk('div', 'pci-actions');

    if (promo.code) {
      const copyBtn = mk('div', 'pci-btn', '📋 Copier');
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(promo.code).then(() => showToast('Code ' + promo.code + ' copié !'));
      };
      actions.appendChild(copyBtn);
    }

    const toggleBtn = mk('div', 'pci-btn', promo.isActive ? '⏸ Désactiver' : '▶ Activer');
    toggleBtn.onclick = () => togglePromo(promo.id);
    actions.appendChild(toggleBtn);

    const delBtn = mk('div', 'pci-btn', '🗑️ Supprimer');
    delBtn.style.cssText = 'color:var(--red);border-color:rgba(192,57,43,.3)';
    delBtn.onclick = () => deletePromo(promo.id);
    actions.appendChild(delBtn);

    card.appendChild(actions);
    frag.appendChild(card);
  });
  promoList.replaceChildren(frag);
}

async function submitPromo() {
  const typeBtn = document.querySelector('.ptg-btn.selected');
  const code    = document.getElementById('promo-code-input')?.value.trim().toUpperCase();
  const discount = document.getElementById('promo-pct-input')?.value;
  const durationDays = parseInt(document.getElementById('promo-duration-select')?.value || '7');
  const maxUses = document.getElementById('promo-maxuses-input')?.value;

  const type = typeBtn?.getAttribute('data-type') || 'CODE';

  if (!discount || parseInt(discount) < 1 || parseInt(discount) > 80) {
    showToast('Entrez une réduction entre 1 et 80%', 'error');
    return;
  }
  if (type === 'CODE' && !code) {
    showToast('Entrez un code promo (ex: SANDAGA20)', 'error');
    return;
  }

  const info = PROMO_TYPE_INFO[type] || PROMO_TYPE_INFO.CODE;
  const title = type === 'CODE' ? code : info.label + ' -' + discount + '%';

  const btn = document.getElementById('promo-submit-btn');
  if (btn) { btn.textContent = '⏳ Création...'; btn.disabled = true; }

  const result = await createPromotion({
    title,
    type,
    code: code || null,
    discount: parseInt(discount),
    durationDays,
    maxUses: maxUses ? parseInt(maxUses) : null
  });

  if (btn) { btn.textContent = '🎯 Activer la promotion'; btn.disabled = false; }

  if (result.success) {
    showToast('✓ Promotion créée et activée !');
    if (document.getElementById('promo-code-input')) document.getElementById('promo-code-input').value = '';
    if (document.getElementById('promo-pct-input'))  document.getElementById('promo-pct-input').value = '';
    if (document.getElementById('promo-maxuses-input')) document.getElementById('promo-maxuses-input').value = '';
    updatePreview();
    loadPromotions();
  } else {
    showToast(result.message || 'Erreur lors de la création', 'error');
  }
}

async function togglePromo(id) {
  const result = await togglePromotion(id);
  if (result.success) { showToast('Promotion mise à jour'); loadPromotions(); }
  else showToast('Erreur', 'error');
}

async function deletePromo(id) {
  if (!confirm('Supprimer cette promotion ?')) return;
  const result = await deletePromotion(id);
  if (result.success) { showToast('Promotion supprimée'); loadPromotions(); }
  else showToast('Erreur', 'error');
}

// ── Navigation entre pages ──
function showPage(pageId, navItem) {
  document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  if (navItem) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');
  }
  const titles = { dashboard:'Tableau de bord', produits:'Mes produits', commandes:'Mes commandes', promotions:'Mes promotions' };
  document.getElementById('tb-title').textContent = titles[pageId] || '';
  if (pageId === 'produits')    loadMyProducts();
  if (pageId === 'commandes')   loadMyOrders();
  if (pageId === 'promotions')  loadPromotions();
}

function goToMessages() {
  const user = getCurrentUser();
  if (!user?.shopId) {
    getDashboard().then(r => {
      const shopId = r?.data?.shop?.id;
      if (shopId) window.location.href = 'marche-senegal-chat.html?shopId=' + shopId;
    });
  } else {
    window.location.href = 'marche-senegal-chat.html?shopId=' + user.shopId;
  }
}

function logoutVendeur() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'marche-senegal-accueil.html';
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sb-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('show');
}
function filterTgl(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function filterOf(btn) {
  document.querySelectorAll('.of-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function selPromoType(btn) {
  document.querySelectorAll('.ptg-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function updatePreview() {
  const code = document.getElementById('promo-code-input')?.value.toUpperCase() || 'SANDAGA20';
  const pct  = document.getElementById('promo-pct-input')?.value || '20';
  const sel  = document.getElementById('promo-duration-select');
  const durVal = sel ? sel.options[sel.selectedIndex]?.text : '7 jours';
  if (document.getElementById('preview-code'))    document.getElementById('preview-code').textContent    = code || 'SANDAGA20';
  if (document.getElementById('preview-pct'))     document.getElementById('preview-pct').textContent     = '-' + (pct || '20') + '%';
  if (document.getElementById('preview-duration')) document.getElementById('preview-duration').textContent = durVal;
}

// ════════════════════════════════════════
//   GRAPHIQUES — Données réelles
// ════════════════════════════════════════

const DONUT_COLORS = ['#1B6B3A', '#E6A817', '#4A90D9', '#C0392B', '#9B59B6'];
const DAY_LABELS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

async function loadCharts(period) {
  const result = await getShopStats(period || '7d');
  if (!result.success) return;

  const { revenueByDay, categories, currentRevenue, revenueChange, currentOrderCount, orderChange, days } = result.data;

  // Mettre à jour les variations KPI
  const kpiChanges = document.querySelectorAll('.kpi-change');
  if (kpiChanges[0]) {
    const up = revenueChange >= 0;
    kpiChanges[0].className = 'kpi-change ' + (up ? 'up' : 'down');
    kpiChanges[0].textContent = (up ? '↑ +' : '↓ ') + revenueChange + '%';
  }
  if (kpiChanges[1]) {
    const up = orderChange >= 0;
    kpiChanges[1].className = 'kpi-change ' + (up ? 'up' : 'down');
    kpiChanges[1].textContent = (up ? '↑ +' : '↓ ') + orderChange + '%';
  }

  renderBarChart(revenueByDay, currentRevenue, days);
  renderDonutChart(categories);
}

function switchPeriod(btn, period) {
  btn.closest('.cc-period').querySelectorAll('.cc-per-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadCharts(period);
}

function groupByN(arr, n) {
  const groups = [];
  for (let i = 0; i < arr.length; i += n) groups.push(arr.slice(i, i + n));
  return groups;
}

function renderBarChart(revenueByDay, totalRevenue, days) {
  const chartBars = document.getElementById('chart-bars');
  const chartFooter = document.getElementById('chart-footer');
  if (!chartBars) return;

  const entries = Object.entries(revenueByDay);

  let bars;
  if (days <= 7) {
    bars = entries.map(([date, revenue]) => ({
      label: DAY_LABELS_FR[new Date(date + 'T12:00:00').getDay()],
      revenue
    }));
  } else if (days <= 30) {
    bars = groupByN(entries, 5).map(group => {
      const d = new Date(group[0][0] + 'T12:00:00');
      return { label: d.getDate() + '/' + (d.getMonth() + 1), revenue: group.reduce((s, [, v]) => s + v, 0) };
    });
  } else {
    bars = groupByN(entries, 15).map(group => {
      const d = new Date(group[0][0] + 'T12:00:00');
      return { label: MONTHS_FR[d.getMonth()], revenue: group.reduce((s, [, v]) => s + v, 0) };
    });
  }

  const maxRev = Math.max(...bars.map(b => b.revenue), 1);
  const avgRev = bars.length > 0 ? Math.round(totalRevenue / bars.length) : 0;
  const todayIdx = days <= 7 ? bars.length - 1 : -1;

  const frag = document.createDocumentFragment();
  bars.forEach((bar, i) => {
    const pct = bar.revenue > 0 ? Math.max(Math.round(bar.revenue / maxRev * 100), 4) : 0;
    const wrap = mk('div', 'mc-bar-wrap');
    const isToday = i === todayIdx;
    const cls = 'mc-bar' + (bar.revenue === 0 ? ' dim' : isToday ? ' gold' : '');
    const b = mk('div', cls);
    b.style.height = pct + '%';
    b.title = formatPrice(bar.revenue);
    wrap.appendChild(b);
    wrap.appendChild(mk('div', 'mc-label', bar.label));
    frag.appendChild(wrap);
  });
  chartBars.replaceChildren(frag);

  if (chartFooter) {
    chartFooter.replaceChildren();
    const s1 = document.createElement('span');
    const b1 = mk('strong', '', formatPrice(totalRevenue));
    b1.style.color = 'var(--green)';
    s1.append('Total : ', b1);
    const s2 = document.createElement('span');
    const b2 = mk('strong', '', formatPrice(avgRev));
    b2.style.color = 'var(--text)';
    s2.append('Moy./jour : ', b2);
    chartFooter.appendChild(s1);
    chartFooter.appendChild(s2);
  }
}

function renderDonutChart(categories) {
  const svg = document.getElementById('donut-svg');
  const centerPct = document.getElementById('donut-center-pct');
  const centerSub = document.getElementById('donut-center-sub');
  const legend = document.getElementById('donut-legend');
  if (!svg || !legend) return;

  // Supprimer les anciens segments (garder le cercle de fond)
  Array.from(svg.querySelectorAll('circle')).slice(1).forEach(c => c.remove());

  if (!categories.length) {
    if (centerPct) centerPct.textContent = '—';
    if (centerSub) centerSub.textContent = 'Aucune vente';
    const msg = mk('div', '', 'Aucune donnée');
    msg.style.cssText = 'font-size:.78rem;color:var(--muted);padding:8px 0';
    legend.replaceChildren(msg);
    return;
  }

  const CIRCUMFERENCE = 2 * Math.PI * 35; // ≈ 220
  const top = categories[0];
  if (centerPct) centerPct.textContent = top.pct + '%';
  if (centerSub) centerSub.textContent = (top.emoji || '') + ' ' + top.name.split(' ')[0];

  let accumulated = 0;
  categories.forEach((cat, i) => {
    const dashLength = (cat.pct / 100) * CIRCUMFERENCE;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '45');
    circle.setAttribute('cy', '45');
    circle.setAttribute('r', '35');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', DONUT_COLORS[i % DONUT_COLORS.length]);
    circle.setAttribute('stroke-width', '12');
    circle.setAttribute('stroke-dasharray', dashLength + ' ' + CIRCUMFERENCE);
    circle.setAttribute('stroke-dashoffset', '-' + accumulated);
    circle.setAttribute('stroke-linecap', 'round');
    svg.appendChild(circle);
    accumulated += dashLength;
  });

  const frag = document.createDocumentFragment();
  categories.forEach((cat, i) => {
    const item = mk('div', 'dl-item');
    const dot = mk('div', 'dl-dot');
    dot.style.background = DONUT_COLORS[i % DONUT_COLORS.length];
    item.appendChild(dot);
    item.appendChild(mk('span', '', (cat.emoji || '') + ' ' + cat.name + ' — ' + cat.pct + '%'));
    frag.appendChild(item);
  });
  legend.replaceChildren(frag);
}

// ── Initialisation ──
document.addEventListener('DOMContentLoaded', async () => {
  const user = getCurrentUser();
  if (!user || user.role !== 'SELLER') { window.location.href = 'marche-senegal-connexion-vendeur.html'; return; }
  await loadDashboard();
  await loadCharts('7d');
});
