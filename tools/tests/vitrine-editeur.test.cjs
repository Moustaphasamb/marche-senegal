// Règles de l'éditeur de vitrine, sans navigateur ni réseau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../vitrine-editeur');

const vue = (id, extra = {}) => ({ id, title: 'Vue ' + id, imageUrl: 'https://ex.test/' + id + '.jpg', hotspots: [], labels: [], ...extra });
const PARFUM = { id: 'c-parfum', name: 'Parfums', emoji: '🌸' };
const VISAGE = { id: 'c-visage', name: 'Soins visage', emoji: '🧴' };

test('position d un toucher en fraction de la photo, bornée', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(E.positionDansPhoto(rect, 110, 45), { x: 0.5, y: 0.25 });
  assert.deepEqual(E.positionDansPhoto(rect, 0, 500), { x: 0, y: 1 });
  assert.deepEqual(E.positionDansPhoto(rect, 10 + 200 / 3, 20), { x: 0.3333, y: 0 });
  assert.equal(E.positionDansPhoto({ left: 0, top: 0, width: 0, height: 10 }, 1, 1), null);
});

test('fichier photo : type et poids', () => {
  assert.equal(E.verifierFichier({ type: 'image/jpeg', size: 1000 }), null);
  assert.match(E.verifierFichier({ type: 'application/pdf', size: 1000 }), /JPG, PNG ou WebP/);
  assert.match(E.verifierFichier({ type: 'image/png', size: 16 * 1024 * 1024 }), /15 Mo/);
  assert.match(E.verifierFichier(null), /Aucune photo/);
});

test('déplacer échange avec le voisin sans modifier la liste reçue', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(E.deplacer(l, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(E.deplacer(l, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(E.deplacer(l, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(l, ['a', 'b', 'c']);
});

test('rayons dans l ordre choisi, puis les autres par nom', () => {
  const autre = { id: 'c-autre', name: 'Accessoires', emoji: '' };
  assert.deepEqual(E.rayonsOrdonnes([PARFUM, VISAGE, autre], ['c-visage']).map(r => r.id), ['c-visage', 'c-autre', 'c-parfum']);
  assert.deepEqual(E.rayonsOrdonnes([PARFUM, VISAGE], null).map(r => r.id), ['c-parfum', 'c-visage']);
});

test('points : ajouter, remplacer, retirer, 50 au plus', () => {
  const v1 = E.ajouterPoint(vue('a'), { productId: 'p1', x: 0.2, y: 0.3, pirate: 1 });
  assert.deepEqual(v1.hotspots, [{ productId: 'p1', x: 0.2, y: 0.3 }]);
  assert.deepEqual(E.remplacerPoint(v1, 0, { productId: 'p1', x: 0.5, y: 0.5 }).hotspots, [{ productId: 'p1', x: 0.5, y: 0.5 }]);
  assert.deepEqual(E.retirerPoint(v1, 0).hotspots, []);
  const pleine = vue('b', { hotspots: Array.from({ length: 50 }, () => ({ productId: 'p', x: 0, y: 0 })) });
  assert.equal(E.ajouterPoint(pleine, { productId: 'p1', x: 0.1, y: 0.1 }), null);
});

test('une étiquette par rayon : la poser ailleurs la retire, la vue qui la perd est enregistrée d abord', () => {
  const vues = [vue('a', { labels: [{ categoryId: 'c-parfum', x: 0.1, y: 0.1 }] }), vue('b')];
  const r = E.poserEtiquette(vues, 'b', 'c-parfum', { x: 0.5, y: 0.6 });
  assert.deepEqual(r.modifiees, ['a', 'b']);
  assert.deepEqual(r.vues[0].labels, []);
  assert.deepEqual(r.vues[1].labels, [{ categoryId: 'c-parfum', x: 0.5, y: 0.6 }]);
  assert.deepEqual(E.etiquetteDe(r.vues, 'c-parfum'), { sceneId: 'b', x: 0.5, y: 0.6 });
  assert.deepEqual(E.poserEtiquette(vues, 'a', 'c-parfum', { x: 0.2, y: 0.2 }).modifiees, ['a']);
  const sans = E.retirerEtiquette(r.vues, 'c-parfum');
  assert.deepEqual(sans.modifiees, ['b']);
  assert.equal(E.etiquetteDe(sans.vues, 'c-parfum'), null);
});

test('produits en vente pas encore placés', () => {
  const produits = [{ id: 'p1', status: 'ACTIVE' }, { id: 'p2', status: 'ACTIVE' }, { id: 'p3', status: 'PAUSED' }];
  const vues = [vue('a', { hotspots: [{ productId: 'p1', x: 0, y: 0 }] })];
  assert.deepEqual(E.produitsNonPlaces(vues, produits).map(p => p.id), ['p2']);
});

test('contrôles avant publication', () => {
  const produits = [
    { id: 'p1', status: 'ACTIVE', category: PARFUM },
    { id: 'p2', status: 'PAUSED', category: VISAGE }
  ];
  const ok = E.controles({ boutiqueActive: true, produits, vues: [vue('a', {
    hotspots: [{ productId: 'p1', x: 0.1, y: 0.1 }], labels: [{ categoryId: 'c-parfum', x: 0.2, y: 0.2 }]
  })] });
  assert.equal(ok.pret, true);

  const ko = E.controles({ boutiqueActive: false, produits, vues: [vue('a', {
    hotspots: [{ productId: 'p2', x: 0.1, y: 0.1 }], labels: [{ categoryId: 'c-visage', x: 0.2, y: 0.2 }]
  })] });
  assert.equal(ko.pret, false);
  assert.deepEqual(ko.lignes.filter(l => !l.ok).map(l => l.sceneId || null), [null, 'a', 'a']);
  assert.equal(E.controles({ boutiqueActive: true, produits, vues: [] }).pret, false);
});

test('chaque action appelle sa route serveur', async () => {
  const appels = [];
  const api = E.creerApi({
    apiCall: async (url, options = {}) => { appels.push([url, options.method || 'GET', options.body ? JSON.parse(options.body) : null]); return { success: true }; },
    envoyerFichier: async f => ({ success: true, url: 'https://ex.test/' + f.name })
  });
  const v = vue('s 1', { hotspots: [{ id: 'h', productId: 'p1', x: 0.1, y: 0.2, product: {} }], labels: [{ id: 'l', categoryId: 'c', x: 0.3, y: 0.4, category: {} }] });
  await api.ouvrir();
  await api.catalogue();
  await api.creerVue({ title: 'Entrée', imageUrl: 'https://ex.test/a.jpg' });
  await api.enregistrerVue(v);
  await api.supprimerVue('s 1');
  await api.ordonnerVues(['b', 'a']);
  await api.ordonnerRayons(['c']);
  await api.reprendreVitrine();
  await api.publier();
  await api.abandonner();
  assert.deepEqual(appels, [
    ['/api/shops/me/shopvision/draft', 'GET', null],
    ['/api/shops/products', 'GET', null],
    ['/api/shops/me/shopvision/scenes', 'POST', { title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [] }],
    ['/api/shops/me/shopvision/scenes/s%201', 'PUT', { title: 'Vue s 1', imageUrl: 'https://ex.test/s 1.jpg', hotspots: [{ productId: 'p1', x: 0.1, y: 0.2 }], labels: [{ categoryId: 'c', x: 0.3, y: 0.4 }] }],
    ['/api/shops/me/shopvision/scenes/s%201', 'DELETE', null],
    ['/api/shops/me/shopvision/scenes-order', 'PUT', { ids: ['b', 'a'] }],
    ['/api/shops/me/shopvision/rayons', 'PUT', { ids: ['c'] }],
    ['/api/shops/me/shopvision/import-vitrine', 'POST', null],
    ['/api/shops/me/shopvision/publish', 'POST', null],
    ['/api/shops/me/shopvision/draft', 'DELETE', null]
  ]);
  assert.deepEqual(await api.envoyerPhoto({ name: 'x.jpg' }), { success: true, url: 'https://ex.test/x.jpg' });
});


test('finitions : seule une vraie coupure réseau est marquée comme telle', async () => {
  const reponses = [{ success: false, message: 'Erreur de connexion au serveur' }, { success: false, message: 'Reconnexion requise' }];
  const api = E.creerApi({ apiCall: async () => reponses.shift(), envoyerFichier: async () => ({ success: false, message: 'Erreur de connexion au serveur' }) });
  assert.equal((await api.ouvrir()).reseau, true);
  assert.equal((await api.ouvrir()).reseau, undefined);
  assert.equal((await api.envoyerPhoto({})).reseau, true);
});

// ── Vue 360° assemblée à partir de plusieurs photos ──
const fichier = (name, lastModified, type = 'image/jpeg') => ({ name, lastModified, type, size: 1000 });

test('les photos de la série reprennent l’ordre de prise : heure, puis nom', () => {
  const serie = [fichier('IMG_0010.jpg', 3000), fichier('IMG_0002.jpg', 1000), fichier('IMG_0009.jpg', 2000)];
  assert.deepEqual(E.ordonnerSerie(serie).map(f => f.name), ['IMG_0002.jpg', 'IMG_0009.jpg', 'IMG_0010.jpg']);
  // Même heure (certains téléphones la remplacent par l'heure du choix) : le numéro décide, 10 après 9.
  const memeHeure = [fichier('IMG_10.jpg', 5), fichier('IMG_9.jpg', 5), fichier('IMG_1.jpg', 5)];
  assert.deepEqual(E.ordonnerSerie(memeHeure).map(f => f.name), ['IMG_1.jpg', 'IMG_9.jpg', 'IMG_10.jpg']);
});

test('une série compte de 6 à 20 photos JPG, PNG ou WebP', () => {
  const n = k => Array.from({ length: k }, (_, i) => fichier('p' + i + '.jpg', i));
  assert.equal(E.verifierSerie(n(5)), 'Choisissez au moins 6 photos qui font le tour de la boutique.');
  assert.equal(E.verifierSerie(n(6)), null);
  assert.equal(E.verifierSerie(n(20)), null);
  assert.equal(E.verifierSerie(n(21)), '20 photos au maximum.');
  assert.equal(E.verifierSerie([...n(6), fichier('video.mp4', 9, 'video/mp4')]), 'Choisissez des photos JPG, PNG ou WebP.');
  assert.equal(E.verifierSerie(null), 'Choisissez au moins 6 photos qui font le tour de la boutique.');
});

test('l’assemblage 360° passe par l’envoi de série, une coupure est marquée réseau', async () => {
  const recus = [];
  const api = E.creerApi({
    apiCall: async () => ({ success: true }),
    envoyerFichier: async () => ({ success: true, url: 'x' }),
    envoyerSerie: async fichiers => { recus.push(fichiers.length); return { success: false, message: 'Erreur de connexion au serveur' }; }
  });
  const r = await api.assembler360([1, 2, 3, 4, 5, 6]);
  assert.deepEqual(recus, [6]);
  assert.equal(r.reseau, true);
});
