/* ShopVision : éditeur connecté au catalogue et à la vitrine Marché Sénégal.
   Une photo dans cette version. Aucun produit ni résultat IA de démonstration. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.ShopVisionCore;
  let shop = null, products = [], ownerId = null, base = '', ready = false, busy = false, dirty = false;
  let scenes = [], currentSceneId = null, scenesLoaded = false;
  let state = { image: null, file: null, hotspots: [] }, editingId = null;
  let zoom = 1, offsetX = 0, offsetY = 0, imageWidth = 0, imageHeight = 0;
  let db = null, storageFailed = false, saveQueue = Promise.resolve(), objectUrl = null;
  let previewRequest = 0, dragged = false;
  const editableButtons = ['emptyUpload', 'replaceImage', 'addHotspot'];
  async function loadScenes() {
    try {
      const result = await apiCall('/api/shops/me/shopvision/scenes');
      if (!result.success || !Array.isArray(result.data)) return;
      scenes = result.data;
      scenesLoaded = true;
      const select = $('sceneSelect'); select.replaceChildren();
      scenes.forEach((scene, index) => select.add(new Option(scene.title || `Scène ${index + 1}`, scene.id)));
      if (scenes.length) { currentSceneId = scenes[0].id; select.value = currentSceneId; $('sceneSyncState').textContent = `${scenes.length} scène${scenes.length > 1 ? 's' : ''} enregistrée${scenes.length > 1 ? 's' : ''}`; }
    } catch { /* La migration peut ne pas être déployée : le studio legacy reste utilisable. */ }
    $('sceneSelect').disabled = !ready || !scenes.length;
    $('newSceneButton').disabled = !ready;
  }
  async function syncScene(url, hotspots) {
    if (!scenesLoaded) return false;
    try {
      const payload = { title: shop.name || 'Ma boutique', imageUrl: url, hotspots: hotspots.map(h => ({ productId: h.productId, x: h.x / 100, y: h.y / 100 })) };
      const result = currentSceneId
        ? await apiCall(`/api/shops/me/shopvision/scenes/${encodeURIComponent(currentSceneId)}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiCall('/api/shops/me/shopvision/scenes', { method: 'POST', body: JSON.stringify(payload) });
      if (!result.success) return false;
      if (result.data?.id) currentSceneId = result.data.id;
      await loadScenes();
      return true;
    } catch { return false; }
  }
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function feedback(message, error = false) {
    $('feedback').textContent = message;
    $('feedback').className = 'sv-feedback' + (error ? ' error' : '');
    $('feedback').hidden = !message;
  }
  function controls() {
    editableButtons.forEach(id => $(id).disabled = !ready || busy);
    $('addHotspot').disabled ||= !state.image || !products.length || state.hotspots.length >= core.MAX_POINTS;
    $('previewButton').disabled = !ready || busy || !state.image;
    $('publishButton').disabled = !ready || busy || !dirty || !state.image || !state.hotspots.length || shop?.status !== 'ACTIVE';
    ['zoomIn', 'zoomOut', 'zoomReset'].forEach(id => $(id).disabled = !state.image || busy);
    $('discardDraft').disabled = busy;
    $('discardDraft').hidden = !dirty;
    $('editor').setAttribute('aria-busy', String(busy));
  }
  function access(title, message, link, label) {
    $('accessPanel').hidden = false;
    $('accessTitle').textContent = title;
    $('accessMessage').textContent = message;
    $('accessLink').hidden = !link;
    if (link) { $('accessLink').href = link; $('accessLink').textContent = label; }
  }
  function confirmAction(title, message) {
    $('confirmTitle').textContent = title; $('confirmMessage').textContent = message;
    const dialog = $('confirmDialog');
    return new Promise(resolve => {
      const finish = answer => {
        dialog.oncancel = null; $('confirmCancel').onclick = null; $('confirmAccept').onclick = null;
        dialog.close(); resolve(answer);
      };
      $('confirmCancel').onclick = () => finish(false);
      $('confirmAccept').onclick = () => finish(true);
      dialog.oncancel = event => { event.preventDefault(); finish(false); };
      dialog.showModal();
    });
  }
  const draftKey = () => `${ownerId}:${shop.id}`;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('marche-senegal-shopvision', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  function readDraft() {
    if (!db) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const req = db.transaction('drafts').objectStore('drafts').get(draftKey());
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  function writeDraft(value) {
    if (!db) return Promise.reject(new Error('Stockage indisponible'));
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      if (value) store.put(value, draftKey()); else store.delete(draftKey());
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  function persist() {
    const value = { schema: 1, ownerId, shopId: shop.id, base, image: state.file ? null : state.image, file: state.file, hotspots: structuredClone(state.hotspots) };
    $('saveState').textContent = 'Enregistrement du brouillon…';
    saveQueue = saveQueue.then(() => writeDraft(value)).then(() => {
      storageFailed = false; $('saveState').textContent = 'Brouillon enregistré sur cet appareil · non publié';
    }).catch(() => {
      storageFailed = true; $('saveState').textContent = 'Brouillon non sauvegardé : gardez cet onglet ouvert.';
    });
  }
  function changed() { dirty = true; persist(); render(); }
  function product(id) { return products.find(p => p.id === id); }
  function setImage(url, file = null) {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    state.file = file;
    if (file) { objectUrl = URL.createObjectURL(file); state.image = objectUrl; } else state.image = core.safeImageUrl(url);
    zoom = 1; offsetX = 0; offsetY = 0;
    $('sceneContent').hidden = !state.image; $('emptyScene').hidden = Boolean(state.image);
    if (state.image) $('sceneImage').src = state.image; else $('sceneImage').removeAttribute('src');
    transform();
  }
  function usePublished() {
    state.hotspots = (shop.showcaseHotspots || []).map(p => ({ id: p.id || crypto.randomUUID(), productId: p.productId, x: p.x, y: p.y, approved: true }));
    setImage(shop.showcaseUrl); base = core.snapshot(shop); dirty = false;
    $('saveState').textContent = shop.showcaseUrl ? 'Version publiée chargée depuis votre boutique' : 'Prêt à créer votre première vitrine';
    render();
  }
  function fitImage() {
    const image = $('sceneImage');
    if (!image.naturalWidth) return;
    const stage = $('sceneStage');
    const ratio = Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
    imageWidth = image.naturalWidth * ratio; imageHeight = image.naturalHeight * ratio;
    $('sceneContent').style.width = imageWidth + 'px'; $('sceneContent').style.height = imageHeight + 'px';
    transform();
  }
  function transform() {
    const stage = $('sceneStage');
    const maxX = Math.max(0, (imageWidth * zoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, (imageHeight * zoom - stage.clientHeight) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX)); offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    $('sceneContent').style.transform = `translate(${offsetX}px,${offsetY}px) scale(${zoom})`;
    $('zoomReset').textContent = Math.round(zoom * 100) + ' %';
    $('hotspotLayer').querySelectorAll('button').forEach(p => p.style.transform = `translate(-50%,-50%) scale(${1 / zoom})`);
  }
  function position(event) {
    const rect = $('sceneImage').getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) / rect.width * 100, y = (event.clientY - rect.top) / rect.height * 100;
    return { x: Math.round(Math.min(100, Math.max(0, x)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, y)) * 10) / 10, inside: x >= 0 && x <= 100 && y >= 0 && y <= 100 };
  }
  function render() {
    const count = state.hotspots.length, commercial = state.hotspots.filter(h => h.kind !== 'decorative' && h.kind !== 'ignored'), approved = commercial.filter(h => h.approved && product(h.productId)).length;
    $('hotspotCount').textContent = count;
    $('reviewProgress').textContent = count ? `${approved} sur ${count} vérifiés` : 'Aucun point pour le moment';
    $('progressPercent').textContent = (count ? Math.round(approved / count * 100) : 0) + ' %';
    $('progressBar').style.transform = `scaleX(${count ? approved / count : 0})`;
    $('sceneStatus').textContent = dirty ? 'Brouillon' : shop?.showcaseUrl ? 'Publiée' : 'À créer';
    $('sceneStatus').classList.toggle('published', !dirty && Boolean(shop?.showcaseUrl));
    $('stepPhoto').classList.toggle('done', Boolean(state.image));
    $('stepProducts').classList.toggle('done', commercial.length > 0 && approved === commercial.length);
    $('stepPublished').classList.toggle('done', !dirty && Boolean(shop?.showcaseUrl));
    $('hotspotLayer').replaceChildren();
    if (count) $('hotspotList').replaceChildren();
    else {
      const empty = element('div', 'sv-list-empty');
      empty.append(element('h3', '', 'Un point, un produit.'), element('p', '', 'Cliquez sur la photo pour associer un produit de votre catalogue.'));
      $('hotspotList').replaceChildren(empty);
    }
    state.hotspots.forEach((hotspot, index) => {
      const p = product(hotspot.productId);
      const point = element('button', 'sv-point' + (hotspot.approved ? '' : ' pending'), index + 1);
      point.style.left = hotspot.x + '%'; point.style.top = hotspot.y + '%'; point.dataset.id = hotspot.id;
      point.setAttribute('aria-label', `Point ${index + 1} : ${p?.name || 'Produit à remplacer'}`);
      point.disabled = busy;
      point.onclick = event => { if (!dragged || event.detail === 0) openEdit(hotspot.id); };
      point.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || busy) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        hotspot.x = Math.max(0, Math.min(100, hotspot.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)));
        hotspot.y = Math.max(0, Math.min(100, hotspot.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)));
        changed(); $('hotspotLayer').querySelector(`[data-id="${CSS.escape(hotspot.id)}"]`)?.focus();
      };
      $('hotspotLayer').append(point);
      const row = element('button', 'sv-product-row'); row.disabled = busy;
      const url = core.safeImageUrl(p?.images?.[0]);
      const thumb = url ? element('img', 'sv-row-image') : element('span', 'sv-row-image', index + 1);
      if (url) { thumb.src = url; thumb.alt = ''; }
      const copy = element('span', 'sv-row-copy');
      copy.append(element('strong', '', p?.name || 'Produit supprimé'), element('small', '', p ? formatPrice(p.price) : 'Choisissez un autre produit'));
      const decorative = hotspot.kind === 'decorative' || hotspot.kind === 'ignored';
      row.append(thumb, copy, element('span', 'sv-review-chip' + (decorative || hotspot.approved && p ? ' approved' : ''), decorative ? 'Zone ignorée' : hotspot.approved && p ? 'Vérifié' : p ? 'À vérifier' : 'Aucun produit'));
      row.onclick = () => openEdit(hotspot.id); $('hotspotList').append(row);
    });
    controls(); transform();
  }
  function productOptions(selected = '') {
    const query = $('productSearch').value.trim().toLocaleLowerCase('fr');
    $('productSelect').replaceChildren(new Option('Choisir un produit', ''));
    products.filter(p => p.id === selected || p.name.toLocaleLowerCase('fr').includes(query)).forEach(p => {
      $('productSelect').add(new Option(`${p.name} — ${formatPrice(p.price)}${p.status !== 'ACTIVE' || p.stock < 1 ? ' · Indisponible' : ''}`, p.id));
    });
    $('productSelect').value = selected;
  }
  function openEdit(id = null, pos = { x: 50, y: 50 }) {
    if (!ready || busy || !state.image) return;
    if (!products.length) { feedback('Ajoutez un produit au catalogue avant de créer un point.', true); return; }
    if (!id && state.hotspots.length >= core.MAX_POINTS) { feedback('La limite est de 50 points par photo.', true); return; }
    editingId = id;
    const hotspot = id ? state.hotspots.find(h => h.id === id) : pos;
    $('dialogTitle').textContent = id ? 'Modifier le point' : 'Relier un produit';
    $('productSearch').value = ''; productOptions(hotspot.productId || '');
    $('pointX').value = hotspot.x; $('pointY').value = hotspot.y; $('pointApproved').checked = Boolean(hotspot.approved); $('pointDecorative').checked = hotspot.kind === 'decorative' || hotspot.kind === 'ignored';
    $('formError').textContent = ''; $('deleteHotspot').hidden = !id;
    $('hotspotDialog').showModal();
  }
  async function importImage(file) {
    if (!ready || busy || !file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      feedback('Choisissez une image JPG, PNG ou WebP de 15 Mo maximum.', true); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const tooLarge = bitmap.width * bitmap.height > 40000000;
      const ratio = bitmap.width / bitmap.height;
      const warning = bitmap.width < 1200 || ratio < 0.65 || ratio > 2.2;
      $('photoQuality').textContent = warning ? 'Photo à améliorer' : 'Photo adaptée';
      $('photoQuality').className = 'sv-guide-chip ' + (warning ? 'warn' : 'good');
      if (warning) feedback('La photo peut fonctionner, mais une image plus nette et moins étirée donnera de meilleurs points produits.');
      bitmap.close();
      if (tooLarge) throw new Error('Cette photo dépasse 40 mégapixels. Choisissez une version plus petite.');
    } catch (error) { feedback(error.message.includes('mégapixels') ? error.message : 'Cette image ne peut pas être lue. Choisissez une autre photo.', true); return; }
    if (state.image && !await confirmAction('Remplacer la photo ?', 'Les points actuels seront retirés du brouillon. Votre vitrine publiée restera inchangée jusqu’à la prochaine publication.')) return;
    state.hotspots = []; setImage(null, file); changed(); feedback('Photo ajoutée au brouillon. Cliquez sur un article pour le relier à votre catalogue.');
  }
  async function publish() {
    if (!ready || busy || !dirty) return;
    let hotspots;
    try { hotspots = core.publication(state, products); } catch (error) { feedback(error.message, true); return; }
    if (!await confirmAction('Publier votre vitrine ?', 'La photo et les points vérifiés remplaceront la vitrine actuellement visible sur votre boutique.')) return;
    busy = true; controls(); feedback('Vérification de votre boutique…');
    try {
      const current = await getDashboard();
      if (!current.success) throw new Error(current.message || 'Impossible de vérifier votre boutique.');
      if (current.data.shop.id !== shop.id || current.data.shop.status !== 'ACTIVE') throw new Error('Votre boutique doit être active pour publier.');
      if (core.snapshot(current.data.shop) !== base) throw new Error('Votre vitrine a changé depuis l’ouverture du studio. Rechargez la page pour choisir quelle version conserver.');
      const catalogue = await getMyProducts();
      if (!catalogue.success) throw new Error(catalogue.message || 'Impossible de vérifier le catalogue.');
      hotspots = core.publication(state, catalogue.data);
      let url = state.image;
      if (state.file) {
        feedback('Envoi de la photo…');
        const body = new FormData(); body.append('image', state.file);
        const response = await fetch(API_URL + '/api/upload/showcase', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body });
        const uploaded = await response.json();
        if (!response.ok || !uploaded.success || !core.safeImageUrl(uploaded.url)) throw new Error(uploaded.message || 'L’envoi de la photo a échoué.');
        url = uploaded.url;
        // Conserver l'URL si la publication échoue : éviter un nouvel upload à la relance.
        setImage(url); persist();
      }
      if (!core.safeImageUrl(url)) throw new Error('La photo n’a pas été envoyée correctement.');
      feedback('Publication de votre vitrine…');
      const result = await apiCall('/api/shops/me/showcase', { method: 'PUT', body: JSON.stringify({ showcaseUrl: url, hotspots }) });
      if (!result.success) throw new Error(result.message || 'La publication a échoué. Votre brouillon est conservé.');
      shop.showcaseUrl = url; shop.showcaseHotspots = hotspots;
      const sceneSynced = await syncScene(url, hotspots);
      base = core.snapshot(shop); dirty = false;
      await saveQueue;
      try { await writeDraft(null); } catch { /* Un vieux brouillon sera détecté par son empreinte à la réouverture. */ }
      products = catalogue.data.filter(p => p.status !== 'DELETED');
      $('saveState').textContent = 'Vitrine publiée sur votre boutique';
      feedback(sceneSynced
        ? 'Votre vitrine est en ligne. La scène est aussi enregistrée pour la visite multi-photo.'
        : 'Votre vitrine est en ligne. La scène principale est publiée ; la synchronisation multi-photo sera activée après migration.');
    } catch (error) { feedback(error.message || 'Erreur réseau. Votre brouillon est conservé.', true); }
    finally { busy = false; render(); }
  }
  function preview() {
    if (!state.image || busy) return;
    previewRequest++;
    $('previewTitle').textContent = shop.name;
    $('customerImage').src = state.image; $('customerHotspots').replaceChildren();
    const intro = element('p', '', 'Sélectionnez un point vérifié pour consulter le produit. Cet aperçu ne publie rien et ne modifie pas le panier.');
    $('previewProduct').replaceChildren(element('h3', '', 'Bienvenue dans votre boutique.'), intro);
    state.hotspots.filter(h => h.approved && product(h.productId)).forEach((h, index) => {
      const point = element('button', 'sv-point', index + 1);
      point.style.left = h.x + '%'; point.style.top = h.y + '%';
      point.setAttribute('aria-label', product(h.productId).name);
      point.onclick = () => previewProduct(h.productId); $('customerHotspots').append(point);
    });
    if (!$('customerHotspots').childElementCount) intro.textContent = 'Vos points apparaîtront ici après leur validation dans le studio.';
    $('customerDialog').showModal();
  }
  async function previewProduct(id) {
    const requestId = ++previewRequest;
    $('previewProduct').replaceChildren(element('p', '', 'Chargement du produit…'));
    try {
      const result = await getProduct(encodeURIComponent(id));
      if (requestId !== previewRequest) return;
      if (!result.success || !result.data || result.data.shopId !== shop.id) throw new Error('Ce produit n’est plus disponible.');
      const p = result.data, panel = $('previewProduct'); panel.replaceChildren();
      const imageUrl = core.safeImageUrl(p.images?.[0]);
      if (imageUrl) { const img = element('img', 'sv-product-photo'); img.src = imageUrl; img.alt = p.name; panel.append(img); }
      panel.append(element('h3', '', p.name), element('p', 'sv-price', formatPrice(p.price)), element('p', '', p.status === 'ACTIVE' && p.stock > 0 ? 'Disponible dans votre catalogue' : 'Actuellement indisponible'));
      const link = element('a', 'sv-button sv-primary', 'Voir le produit'); link.href = 'marche-senegal-produit.html?id=' + encodeURIComponent(id); panel.append(link);
      panel.append(element('p', 'sv-preview-disclaimer', 'Le client choisit ses options et ajoute le produit au panier depuis sa fiche.'));
    } catch (error) { if (requestId === previewRequest) $('previewProduct').replaceChildren(element('p', '', error.message)); }
  }
  function initGestures() {
    const stage = $('sceneStage'), pointers = new Map();
    let gesture = null;
    stage.addEventListener('pointerdown', event => {
      if (!state.image || !ready || busy || event.button > 0 || event.target.closest('#emptyScene')) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const point = event.target.closest('.sv-point'); dragged = false;
      stage.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), zoom }; dragged = true;
      } else gesture = { type: point ? 'point' : 'pan', id: point?.dataset.id, x: event.clientX, y: event.clientY, offsetX, offsetY, moved: false };
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.type === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        zoom = Math.max(1, Math.min(4, gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.distance))); transform(); return;
      }
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5 && !gesture.moved) return;
      dragged = true; gesture.moved = true;
      if (gesture.type === 'point') {
        const pos = position(event), point = state.hotspots.find(h => h.id === gesture.id);
        if (!pos || !point) return;
        point.x = pos.x; point.y = pos.y;
        const button = $('hotspotLayer').querySelector(`[data-id="${CSS.escape(point.id)}"]`);
        button.style.left = point.x + '%'; button.style.top = point.y + '%';
      } else if (gesture.type === 'pan') { offsetX = gesture.offsetX + event.clientX - gesture.x; offsetY = gesture.offsetY + event.clientY - gesture.y; transform(); }
    });
    const finish = event => {
      if (!pointers.has(event.pointerId)) return;
      const previous = gesture; pointers.delete(event.pointerId);
      if (previous?.type === 'point' && previous.moved) changed();
      else if (previous?.type === 'point' && event.type !== 'pointercancel') openEdit(previous.id);
      else if (previous?.type === 'pan' && !previous.moved && event.type !== 'pointercancel') {
        const pos = position(event); if (pos?.inside) openEdit(null, pos);
      }
      gesture = null; if (!pointers.size) dragged = true;
    };
    stage.addEventListener('pointerup', finish); stage.addEventListener('pointercancel', finish);
    stage.addEventListener('wheel', event => {
      if (!state.image || busy) return;
      event.preventDefault(); zoom = Math.max(1, Math.min(4, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); transform();
    }, { passive: false });
    new ResizeObserver(fitImage).observe(stage);
  }
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  $('menuButton').onclick = toggleSidebar;
  $('emptyUpload').onclick = $('replaceImage').onclick = () => { if (ready && !busy) $('imageInput').click(); };
  $('newSceneButton').onclick = () => { if (ready && !busy) $('imageInput').click(); };
  $('sceneSelect').onchange = () => {
    const scene = scenes.find(item => item.id === $('sceneSelect').value);
    if (!scene || busy) return;
    currentSceneId = scene.id;
    state.hotspots = (scene.hotspots || []).map(h => ({ id: h.id || crypto.randomUUID(), productId: h.productId, x: Number(h.x) * 100, y: Number(h.y) * 100, approved: true }));
    setImage(scene.imageUrl); dirty = false; base = core.snapshot(shop); render();
    $('saveState').textContent = 'Scène chargée depuis votre boutique';
  };
  $('imageInput').onchange = event => { const file = event.target.files[0]; event.target.value = ''; void importImage(file); };
  $('sceneImage').onload = fitImage;
  $('sceneImage').onerror = () => feedback('La photo ne peut pas être affichée. Réessayez avec une autre image.', true);
  $('addHotspot').onclick = () => openEdit(); $('previewButton').onclick = preview; $('publishButton').onclick = publish;
  $('productSearch').oninput = () => productOptions($('productSelect').value);
  $('productSelect').onchange = () => { $('pointApproved').checked = false; };
  $('hotspotForm').onsubmit = event => {
    event.preventDefault();
    const decorative = $('pointDecorative').checked;
    const values = { productId: decorative ? null : $('productSelect').value, x: Number($('pointX').value), y: Number($('pointY').value), approved: decorative || $('pointApproved').checked, kind: decorative ? 'decorative' : 'product' };
    if ((!decorative && !product(values.productId)) || !core.coordinate(values.x) || !core.coordinate(values.y)) { $('formError').textContent = decorative ? 'Vérifiez la position entre 0 et 100.' : 'Choisissez un produit et des positions entre 0 et 100.'; return; }
    if (editingId) Object.assign(state.hotspots.find(h => h.id === editingId), values);
    else state.hotspots.push({ id: crypto.randomUUID(), ...values });
    $('hotspotDialog').close(); changed(); feedback('');
  };
  $('deleteHotspot').onclick = () => { state.hotspots = state.hotspots.filter(h => h.id !== editingId); $('hotspotDialog').close(); changed(); };
  $('zoomIn').onclick = () => { zoom = Math.min(4, zoom * 1.25); transform(); };
  $('zoomOut').onclick = () => { zoom = Math.max(1, zoom / 1.25); transform(); };
  $('zoomReset').onclick = () => { zoom = 1; offsetX = offsetY = 0; transform(); };
  $('discardDraft').onclick = async () => {
    if (busy || !await confirmAction('Abandonner ce brouillon ?', 'La dernière vitrine chargée depuis votre boutique remplacera vos modifications locales.')) return;
    await saveQueue;
    try { await writeDraft(null); usePublished(); feedback('Version publiée restaurée dans le studio.'); }
    catch { feedback('Impossible de supprimer le brouillon local. Réessayez.', true); }
  };
  $('retryButton').onclick = () => location.reload();
  window.addEventListener('beforeunload', event => { if (busy || (dirty && storageFailed)) { event.preventDefault(); event.returnValue = ''; } });
  initGestures();
  try {
    if (!isLoggedIn()) {
      access('Créez la vitrine de votre boutique', 'Connectez-vous avec votre compte vendeur pour retrouver vos produits et préparer votre vitrine interactive.', 'marche-senegal-connexion-vendeur.html', 'Se connecter comme vendeur');
      $('saveState').textContent = 'Votre studio est prêt · connexion vendeur requise'; $('sceneStatus').textContent = 'À créer'; controls(); return;
    }
    let user = getCurrentUser();
    if (!user?.id) {
      const profile = await apiCall('/api/auth/me');
      if (profile.success && profile.user?.id) {
        user = profile.user;
        localStorage.setItem('user', JSON.stringify(user));
      }
    }
    if (!user || String(user.role).toUpperCase() !== 'SELLER') {
      access('Un espace réservé aux vendeurs', 'Ouvrez une session vendeur pour gérer la vitrine de votre boutique.', 'marche-senegal-connexion-vendeur.html', 'Accéder à la connexion vendeur');
      $('saveState').textContent = 'Compte vendeur requis'; controls(); return;
    }
    busy = true; controls();
    const [dashboard, catalogue] = await Promise.all([getDashboard(), getMyProducts()]);
    if (!dashboard.success || !catalogue.success) throw new Error(dashboard.message || catalogue.message || 'Impossible de charger votre boutique.');
    shop = dashboard.data.shop; ownerId = user.id || user.userId;
    if (!ownerId || !shop?.id) throw new Error('Session incomplète. Reconnectez-vous.');
    products = catalogue.data.filter(p => p.status !== 'DELETED');
    remplirIdentiteMenu(shop);
    $('publicShopLink').href = 'marche-senegal-boutique.html?id=' + encodeURIComponent(shop.id); $('publicShopLink').hidden = false;
    $('catalogSummary').textContent = `${products.length} produit${products.length > 1 ? 's' : ''} dans votre catalogue. Prix et disponibilités liés à votre boutique.`;
    if (shop.status !== 'ACTIVE') access('Votre boutique attend sa validation', 'Vous pouvez préparer votre photo. La publication sera disponible lorsque votre boutique sera active.', 'marche-senegal-ma-boutique.html', 'Consulter mon dossier');
    else if (!products.length) access('Ajoutez votre premier produit', 'La vitrine relie la photo aux vrais articles de votre catalogue.', 'marche-senegal-ajout-produit.html', 'Ajouter un produit');
    usePublished();
    try {
      db = await openDatabase();
      const draft = await readDraft();
      if (core.validDraft(draft, ownerId, shop.id)) {
        if (draft.base === base || await confirmAction('Un brouillon est disponible', 'Votre vitrine a changé depuis ce brouillon. Voulez-vous reprendre le brouillon local ? Annuler conserve la version actuellement publiée.')) {
          state.hotspots = draft.hotspots; setImage(draft.image, draft.file instanceof Blob ? draft.file : null);
          dirty = true; $('saveState').textContent = 'Brouillon restauré sur cet appareil · non publié';
        }
      }
    } catch { storageFailed = true; feedback('Le stockage local est indisponible. Gardez cet onglet ouvert jusqu’à la publication.', true); }
    ready = true;
    $('sceneSelect').addEventListener('focus', () => { if (ready && !scenesLoaded) void loadScenes(); }, { once: true });
  } catch (error) {
    access('Connexion à la boutique indisponible', error.message || 'Le serveur ne répond pas. Réessayez.', null);
    $('retryButton').hidden = false; $('saveState').textContent = 'Chargement interrompu · aucune modification';
  } finally { busy = false; render(); }
})();
