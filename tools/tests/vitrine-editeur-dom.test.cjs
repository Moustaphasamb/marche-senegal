// Assistant de vitrine dans la vraie page, avec un serveur doublé : ni réseau, ni base.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(root, f), 'utf8');
const page = lire('marche-senegal-shopvision.html');
const bloc = page.slice(page.indexOf('<section class="ve"'), page.indexOf('<!-- /ve -->'));

const PARFUM = { id: 'c-parfum', name: 'Parfums', emoji: '🌸' };
const VISAGE = { id: 'c-visage', name: 'Soins visage', emoji: '🧴' };
const PRODUITS = [
  { id: 'p1', name: 'Huile de baobab', status: 'ACTIVE', category: PARFUM },
  { id: 'p2', name: 'Crème hibiscus', status: 'PAUSED', category: VISAGE },
  { id: 'p3', name: '<img src=x onerror=globalThis.pirate=1>', status: 'ACTIVE', category: VISAGE }
];
const vue = (id, extra = {}) => ({ id, shopId: 'b1', title: 'Vue ' + id, imageUrl: 'https://ex.test/' + id + '.jpg', status: 'DRAFT', hotspots: [], labels: [], ...extra });
const copie = x => JSON.parse(JSON.stringify(x));

// Serveur doublé : garde son propre état, comme le vrai brouillon.
function serveur(init = {}) {
  const appels = [];
  const etat = { scenes: copie(init.scenes || []), rayonOrder: init.rayonOrder || [], vitrine: !!init.vitrine };
  let n = 0;
  const ok = data => Promise.resolve({ success: true, data: copie(data) });
  const api = {
    ouvrir: () => { appels.push(['ouvrir']); return ok({ scenes: etat.scenes, rayons: [PARFUM, VISAGE], rayonOrder: etat.rayonOrder, vitrine: etat.vitrine && !etat.scenes.length }); },
    catalogue: () => (init.catalogueEchoue ? Promise.resolve({ success: false, reseau: true, message: 'Erreur de connexion au serveur' }) : ok(init.produits || PRODUITS)),
    creerVue: v => { appels.push(['creerVue', copie(v)]); if (init.creerEchoue) { init.creerEchoue -= 1; return Promise.resolve({ success: false, reseau: true, message: 'Erreur de connexion au serveur' }); } const s = vue('n' + (++n), { title: v.title, imageUrl: v.imageUrl }); etat.scenes.push(s); return ok(s); },
    enregistrerVue: v => {
      appels.push(['enregistrerVue', copie(v)]);
      const rang = appels.filter(a => a[0] === 'enregistrerVue').length;
      if ((init.echecsEnregistrement || []).includes(rang)) return Promise.resolve({ success: false, reseau: true, message: 'Erreur de connexion au serveur' });
      if (init.refusEnregistrement) return Promise.resolve({ success: false, message: init.messageRefus || 'Scène introuvable' });
      if (init.bloquer) return init.bloquer.then(() => { etat.scenes = etat.scenes.map(s => (s.id === v.id ? copie(v) : s)); return ok(v); });
      etat.scenes = etat.scenes.map(s => (s.id === v.id ? copie(v) : s)); return ok(v);
    },
    supprimerVue: id => { appels.push(['supprimerVue', id]); etat.scenes = etat.scenes.filter(s => s.id !== id); return ok({ id }); },
    ordonnerVues: ids => { appels.push(['ordonnerVues', ids]); etat.scenes = ids.map(id => etat.scenes.find(s => s.id === id)); return ok({ ids }); },
    ordonnerRayons: ids => { appels.push(['ordonnerRayons', ids]); etat.rayonOrder = ids; return ok({ rayonOrder: ids }); },
    reprendreVitrine: () => { appels.push(['reprendreVitrine']); const s = vue('vit', { title: 'Vitrine' }); etat.scenes = [s]; return ok(s); },
    publier: () => {
      appels.push(['publier']);
      if (init.bloquerPublication) return init.bloquerPublication.then(() => ok({ scenes: etat.scenes, rayonOrder: etat.rayonOrder }));
      if (init.refusPublication) return Promise.resolve({ success: false, message: 'Refus', data: { problemes: [{ code: 'produit_inactif', message: '« Vue a » : un point vise un produit qui n’est plus en vente.' }] } });
      return ok({ scenes: etat.scenes, rayonOrder: etat.rayonOrder });
    },
    abandonner: () => { appels.push(['abandonner']); etat.scenes = []; return ok({ abandonne: true }); },
    envoyerPhoto: f => {
      appels.push(['envoyerPhoto', f.name]);
      if (init.envoiEchoue) { init.envoiEchoue -= 1; return Promise.resolve({ success: false, reseau: true, message: 'Erreur de connexion au serveur' }); }
      return Promise.resolve({ success: true, url: 'https://ex.test/' + f.name });
    }
  };
  return { api, appels, etat };
}

async function monter(init = {}) {
  const dom = new JSDOM('<!doctype html><body>' + bloc + '</body>', { url: 'http://localhost:5500/marche-senegal-shopvision.html', runScripts: 'outside-only' });
  const w = dom.window;
  // etroit : écran de téléphone (l'aperçu client ne s'affiche qu'à la demande).
  if (init.etroit) w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.eval(lire('vitrine-editeur.js'));
  w.eval(lire('vitrine-editeur-ui.js'));
  const s = serveur(init);
  const confirmations = [];
  const ctl = w.VitrineEditeur.monter({
    api: s.api,
    boutique: { id: 'b1', name: 'Awa Beauté', status: init.statut || 'ACTIVE' },
    lienApercu: 'marche-senegal-boutique.html?id=b1&apercu=brouillon',
    lienPublic: 'https://ms.test/boutiques/b1',
    confirmer: async m => { confirmations.push(m); return !init.refuserConfirmation; }
  });
  await ctl.charger();
  const q = sel => w.document.querySelector(sel);
  const qa = sel => [...w.document.querySelectorAll(sel)];
  const bouton = texte => qa('#ve-panel button').find(b => b.textContent.includes(texte));
  const attendre = () => new Promise(r => setTimeout(r, 0));
  return { w, q, qa, bouton, attendre, ctl, confirmations, ...s };
}

// Simule le choix d'un fichier dans un champ caché.
async function choisirFichier(t, id, nom, type = 'image/jpeg') {
  const champ = t.q(id);
  const fichier = new t.w.File(['x'], nom, { type });
  Object.defineProperty(champ, 'files', { configurable: true, value: [fichier] });
  champ.dispatchEvent(new t.w.Event('change'));
  for (let i = 0; i < 5; i++) await t.attendre();
}

test('le brouillon est chargé : étape 1, étapes suivantes fermées sans photo', async () => {
  const t = await monter();
  assert.equal(t.q('#ve-steps button[data-etape="1"]').getAttribute('aria-current'), 'true');
  assert.equal(t.q('#ve-steps button[data-etape="2"]').disabled, true);
  assert.match(t.q('#ve-panel h2').textContent, /photos/i);
  assert.equal(t.qa('.ve-view').length, 0);
});

test('reprendre l ancienne vitrine en première photo', async () => {
  const t = await monter({ vitrine: true });
  t.bouton('Reprendre ma vitrine actuelle').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.map(a => a[0]), ['ouvrir', 'reprendreVitrine']);
  assert.equal(t.qa('.ve-view').length, 1);
  assert.equal(t.bouton('Reprendre ma vitrine actuelle'), undefined);
});

test('ajouter une photo : envoi puis création de la vue', async () => {
  const t = await monter();
  await choisirFichier(t, '#ve-file', 'entree.jpg');
  assert.deepEqual(t.appels.slice(1), [['envoyerPhoto', 'entree.jpg'], ['creerVue', { title: 'Photo 1', imageUrl: 'https://ex.test/entree.jpg' }]]);
  assert.equal(t.qa('.ve-view').length, 1);
  assert.equal(t.q('#ve-steps button[data-etape="2"]').disabled, false);
});

test('un fichier qui n est pas une photo est refusé sans envoi', async () => {
  const t = await monter();
  await choisirFichier(t, '#ve-file', 'devis.pdf', 'application/pdf');
  assert.equal(t.appels.length, 1);
  assert.match(t.q('#ve-status').textContent, /JPG, PNG ou WebP/);
  assert.ok(t.q('#ve-status').classList.contains('ve-error'));
});

test('sans réseau : l écran garde son état et propose de réessayer', async () => {
  const t = await monter({ envoiEchoue: 1 });
  await choisirFichier(t, '#ve-camera', 'rayon.jpg');
  assert.match(t.q('#ve-status').textContent, /Non enregistré/);
  assert.equal(t.appels.filter(a => a[0] === 'ouvrir').length, 1, 'pas de rechargement sans réseau');
  t.q('#ve-status button').click();
  for (let i = 0; i < 5; i++) await t.attendre();
  assert.equal(t.qa('.ve-view').length, 1);
});

test('renommer, réordonner et supprimer une photo', async () => {
  const t = await monter({ scenes: [vue('a'), vue('b')] });
  const titre = t.qa('.ve-view input')[1];
  titre.value = 'Mur des parfums';
  titre.dispatchEvent(new t.w.Event('change'));
  await t.attendre(); await t.attendre();
  assert.equal(t.appels.at(-1)[1].title, 'Mur des parfums');

  t.qa('.ve-view')[0].querySelector('button[aria-label^="Descendre"]').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1), ['ordonnerVues', ['b', 'a']]);
  assert.equal(t.qa('.ve-view input')[0].value, 'Mur des parfums');

  t.qa('.ve-view')[1].querySelector('button[aria-label^="Supprimer"]').click();
  await t.attendre(); await t.attendre(); await t.attendre();
  assert.equal(t.confirmations.length, 1);
  assert.deepEqual(t.appels.at(-1), ['supprimerVue', 'a']);
  assert.equal(t.qa('.ve-view').length, 1);
});

test('un nom de photo vide est refusé sans appel', async () => {
  const t = await monter({ scenes: [vue('a')] });
  const titre = t.q('.ve-view input');
  titre.value = '   ';
  titre.dispatchEvent(new t.w.Event('change'));
  await t.attendre();
  assert.equal(t.appels.length, 1);
  assert.equal(titre.value, 'Vue a');
});

test('huit photos : les boutons d ajout sont désactivés', async () => {
  const t = await monter({ scenes: Array.from({ length: 8 }, (_, i) => vue('v' + i)) });
  assert.equal(t.bouton('Ajouter une photo').disabled, true);
  assert.equal(t.bouton('Prendre une photo').disabled, true);
});
// Toucher la photo à une position donnée (la photo mesure 200 × 100 dans le test).
async function toucherPhoto(t, x, y) {
  const img = t.q('.ve-photo img');
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  img.dispatchEvent(new t.w.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  await t.attendre();
}

test('étape 2 : toucher la photo puis choisir le produit crée un point', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(2);
  await toucherPhoto(t, 50, 25);
  assert.ok(t.q('.ve-choice'), 'le choix du produit est proposé');
  assert.ok(t.q('.ve-cible'));
  t.qa('.ve-product').find(b => b.textContent === 'Huile de baobab').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].hotspots, [{ productId: 'p1', x: 0.25, y: 0.25 }]);
  assert.equal(t.qa('.ve-point').length, 1);
  assert.equal(t.q('.ve-choice'), null);
});

test('étape 2 : la recherche filtre, un nom piégé reste du texte', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(2);
  await toucherPhoto(t, 10, 10);
  const recherche = t.q('.ve-search');
  recherche.value = 'crème';
  recherche.dispatchEvent(new t.w.Event('input'));
  assert.deepEqual(t.qa('.ve-product').map(b => b.textContent), ['Crème hibiscus (hors vente)']);
  recherche.value = '';
  recherche.dispatchEvent(new t.w.Event('input'));
  assert.equal(t.w.pirate, undefined);
  assert.equal(t.q('.ve-products img'), null);
});

test('étape 2 : toucher un point ne crée pas de point, on peut le déplacer puis le retirer', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(2);
  t.q('.ve-point').click();
  await t.attendre();
  assert.equal(t.q('.ve-choice'), null);
  t.bouton('Déplacer').click();
  await toucherPhoto(t, 20, 80);
  await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].hotspots, [{ productId: 'p1', x: 0.1, y: 0.8 }]);
  t.q('.ve-point').click();
  await t.attendre();
  t.bouton('Retirer').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].hotspots, []);
});

test('étape 2 : un point sur un produit hors vente est signalé, le compteur indique les produits non placés', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p2', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(2);
  assert.ok(t.q('.ve-point').classList.contains('ve-warn'));
  assert.match(t.q('#ve-panel').textContent, /2 produits en vente pas encore placés/);
});

test('étape 2 : plusieurs photos, on change de photo par les onglets', async () => {
  const t = await monter({ scenes: [vue('a'), vue('b', { hotspots: [{ productId: 'p1', x: 0.1, y: 0.1 }] })] });
  t.ctl.allerA(2);
  assert.equal(t.qa('.ve-point').length, 0);
  t.qa('.ve-tab')[1].click();
  await t.attendre();
  assert.equal(t.qa('.ve-point').length, 1);
  assert.equal(t.q('.ve-photo img').getAttribute('src'), 'https://ex.test/b.jpg');
});
test('étape 3 : les rayons suivent l ordre choisi et se réordonnent', async () => {
  const t = await monter({ scenes: [vue('a')], rayonOrder: ['c-visage'] });
  t.ctl.allerA(3);
  assert.deepEqual(t.qa('.ve-rname').map(x => x.textContent), ['🧴 Soins visage', '🌸 Parfums']);
  t.qa('.ve-rayon')[0].querySelector('button[aria-label^="Descendre"]').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1), ['ordonnerRayons', ['c-parfum', 'c-visage']]);
  assert.deepEqual(t.qa('.ve-rname').map(x => x.textContent), ['🌸 Parfums', '🧴 Soins visage']);
});

// ── Aperçu client intégré (partie 3) ──
const srcApercu = t => (t.q('#ve-apercu iframe') || {}).src || '';

test('aperçu client : caché aux étapes 1 et 2, montré aux étapes 3 et 4 avec la vraie page en mode intégré', async () => {
  const t = await monter({ scenes: [vue('a')] });
  assert.equal(t.q('#ve-apercu').hidden, true);
  t.ctl.allerA(2);
  assert.equal(t.q('#ve-apercu').hidden, true);
  t.ctl.allerA(3);
  assert.equal(t.q('#ve-apercu').hidden, false);
  assert.match(srcApercu(t), /marche-senegal-boutique\.html\?id=b1&apercu=brouillon&integre=1/);
  assert.match(t.q('#ve-apercu').textContent, /Ce que voit le client/);
  assert.equal(t.q('#ve-apercu a').getAttribute('href'), 'marche-senegal-boutique.html?id=b1&apercu=brouillon');
  t.ctl.allerA(4);
  assert.equal(t.q('#ve-apercu').hidden, false);
});

test('aperçu client : rechargé après un enregistrement réussi, pas à chaque affichage', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(3);
  const avant = srcApercu(t);
  const cadre = t.q('#ve-apercu iframe');
  t.qa('.ve-rayon')[0].querySelector('button.ve-btn').click(); // « Poser l'étiquette » : simple affichage
  await t.attendre();
  assert.equal(srcApercu(t), avant);
  assert.equal(t.q('#ve-apercu iframe'), cadre, 'la fenêtre n est pas recréée');
  t.qa('.ve-rayon')[0].querySelector('button[aria-label^="Descendre"]').click();
  await t.attendre(); await t.attendre();
  assert.notEqual(srcApercu(t), avant);
  assert.match(srcApercu(t), /integre=1/);
});

test('aperçu client sur téléphone : rien n est chargé avant « Voir comme un client », puis plein écran et retour', async () => {
  const t = await monter({ scenes: [vue('a')], etroit: true });
  t.ctl.allerA(3);
  assert.equal(srcApercu(t), '');
  t.bouton('Voir comme un client').click();
  await t.attendre();
  assert.ok(t.q('#ve-apercu').classList.contains('ve-ouvert'));
  assert.match(srcApercu(t), /integre=1/);
  t.q('#ve-apercu button').click();
  assert.equal(t.q('#ve-apercu').classList.contains('ve-ouvert'), false);
});

test('étape 3 : poser une étiquette de rayon sur la photo', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(3);
  t.qa('.ve-rayon')[0].querySelector('button.ve-btn').click();
  await t.attendre();
  await toucherPhoto(t, 100, 50);
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].labels, [{ categoryId: 'c-parfum', x: 0.5, y: 0.5 }]);
  assert.match(t.q('.ve-label').textContent, /Parfums · Voir le rayon/);
  assert.match(t.qa('.ve-rayon')[0].textContent, /Étiquette sur « Vue a »/);
});

test('étape 3 : déplacer une étiquette vers une autre photo enregistre d abord la photo qui la perd', async () => {
  const t = await monter({ scenes: [vue('a', { labels: [{ categoryId: 'c-parfum', x: 0.1, y: 0.1 }] }), vue('b')] });
  t.ctl.allerA(3);
  t.qa('.ve-rayon')[0].querySelector('button.ve-btn').click();
  await t.attendre();
  t.qa('.ve-tab')[1].click();
  await t.attendre();
  await toucherPhoto(t, 40, 60);
  for (let i = 0; i < 6; i++) await t.attendre();
  const enregistrements = t.appels.filter(a => a[0] === 'enregistrerVue');
  assert.deepEqual(enregistrements.map(a => [a[1].id, a[1].labels.length]), [['a', 0], ['b', 1]]);
});

test('étape 3 : toucher la photo sans rayon choisi n enregistre rien', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(3);
  await toucherPhoto(t, 100, 50);
  assert.equal(t.appels.length, 1);
  assert.match(t.q('#ve-status').textContent, /Choisissez d’abord un rayon/);
});

test('étape 3 : retirer une étiquette', async () => {
  const t = await monter({ scenes: [vue('a', { labels: [{ categoryId: 'c-visage', x: 0.1, y: 0.1 }] })] });
  t.ctl.allerA(3);
  [...t.qa('.ve-rayon')[1].querySelectorAll('button')].find(b => b.textContent === 'Retirer').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].labels, []);
});
test('étape 4 : liste de contrôle, aperçu et publication', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(4);
  assert.ok(t.qa('.ve-checks li').every(li => li.classList.contains('ve-ok')));
  // L'aperçu est la fenêtre « Ce que voit le client », avec son lien vers un onglet.
  assert.equal(t.q('#ve-apercu').hidden, false);
  assert.equal(t.q('#ve-apercu-onglet').getAttribute('href'), 'marche-senegal-boutique.html?id=b1&apercu=brouillon');
  assert.ok(t.bouton('Voir comme un client'));
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.equal(t.confirmations.length, 1);
  assert.ok(t.appels.some(a => a[0] === 'publier'));
  assert.match(t.q('#ve-status').textContent, /en ligne/);
});

// ── Partie 4 : bilan avant, moment « c'est en ligne » après ──
test('étape 4 : bilan résumé et conseils non bloquants, chacun mène à sa correction', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] }), vue('b')] });
  t.ctl.allerA(4);
  assert.match(t.q('.ve-bilan').textContent, /2 photos · 1 produit placé · 0 rayon étiqueté/);
  const conseils = t.qa('.ve-conseil');
  assert.equal(conseils.length, 2);
  assert.match(conseils[0].textContent, /1 produit en vente n’est sur aucune photo : <img src=x onerror=globalThis\.pirate=1>\./);
  assert.equal(t.w.pirate, undefined);
  assert.match(conseils[1].textContent, /La photo « Vue b » n’a aucun produit/);
  assert.equal(t.bouton('Publier ma boutique').disabled, false, 'un conseil ne bloque pas');
  conseils[1].querySelector('button').click();
  assert.equal(t.q('#ve-steps button[data-etape="2"]').getAttribute('aria-current'), 'true');
  assert.equal(t.ctl.etat.courante, 1);
});

test('après publication : « Votre vitrine est en ligne », voir, partager sur WhatsApp, copier le lien', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  const carte = t.q('.ve-en-ligne');
  assert.ok(carte);
  assert.match(carte.textContent, /Votre vitrine est en ligne/);
  assert.equal(t.q('.ve-checks'), null);
  const liens = [...carte.querySelectorAll('a')];
  const voir = liens.find(a => /Voir ma boutique/.test(a.textContent));
  assert.equal(voir.getAttribute('href'), 'https://ms.test/boutiques/b1');
  assert.equal(voir.target, '_blank');
  const wa = liens.find(a => /WhatsApp/.test(a.textContent));
  assert.ok(wa.getAttribute('href').startsWith('https://wa.me/?text='));
  assert.match(decodeURIComponent(wa.getAttribute('href')), /Awa Beauté sur Marché Sénégal : https:\/\/ms\.test\/boutiques\/b1/);
  [...carte.querySelectorAll('button')].find(b => /Copier le lien/.test(b.textContent)).click();
  await t.attendre();
  assert.match(t.q('#ve-status').textContent, /https:\/\/ms\.test\/boutiques\/b1/);
});

test('après publication, une nouvelle modification ramène au bilan', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.ok(t.q('.ve-en-ligne'));
  t.ctl.allerA(3);
  t.qa('.ve-rayon')[0].querySelector('button[aria-label^="Descendre"]').click();
  await t.attendre(); await t.attendre();
  t.ctl.allerA(4);
  assert.equal(t.q('.ve-en-ligne'), null);
  assert.ok(t.q('.ve-checks'));
});

test('étape 4 : un point sur un produit hors vente bloque la publication', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p2', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(4);
  assert.ok(t.qa('.ve-checks li.ve-ko').some(li => /plus en vente/.test(li.textContent)));
  assert.equal(t.bouton('Publier ma boutique').disabled, true);
});

test('étape 4 : une boutique pas encore validée ne publie pas', async () => {
  const t = await monter({ scenes: [vue('a')], statut: 'PENDING' });
  t.ctl.allerA(4);
  assert.equal(t.bouton('Publier ma boutique').disabled, true);
});

test('étape 4 : un refus du serveur affiche ses raisons', async () => {
  const t = await monter({ scenes: [vue('a')], refusPublication: true });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.ok(t.qa('.ve-checks li.ve-ko').some(li => /plus en vente/.test(li.textContent)));
  assert.ok(t.q('#ve-status').classList.contains('ve-error'));
});

test('étape 4 : abandonner ramène à la version en ligne, après confirmation', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.ctl.allerA(4);
  t.bouton('Abandonner mes changements').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.ok(t.appels.some(a => a[0] === 'abandonner'));
  assert.equal(t.ctl.etat.etape, 1);
  assert.match(t.q('#ve-status').textContent, /abandonnées/);
});

test('étape 4 : sans confirmation, rien n est publié', async () => {
  const t = await monter({ scenes: [vue('a')], refuserConfirmation: true });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 4; i++) await t.attendre();
  assert.ok(!t.appels.some(a => a[0] === 'publier'));
});

test('un refus du serveur recharge le brouillon (le serveur fait foi)', async () => {
  const t = await monter({ scenes: [vue('a')], refusEnregistrement: true });
  const titre = t.q('.ve-view input');
  titre.value = 'Nouveau nom';
  titre.dispatchEvent(new t.w.Event('change'));
  for (let i = 0; i < 4; i++) await t.attendre();
  assert.equal(t.appels.filter(a => a[0] === 'ouvrir').length, 2);
  assert.equal(t.q('.ve-view input').value, 'Vue a');
  assert.match(t.q('#ve-status').textContent, /Scène introuvable/);
});


test('relecture : une étiquette dont le rayon a disparu n empêche pas d enregistrer la photo', async () => {
  const t = await monter({ scenes: [vue('a', { labels: [{ categoryId: 'c-disparu', x: 0.1, y: 0.1 }, { categoryId: 'c-parfum', x: 0.2, y: 0.2 }] })] });
  const titre = t.q('.ve-view input');
  titre.value = 'Entrée';
  titre.dispatchEvent(new t.w.Event('change'));
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].labels.map(l => l.categoryId), ['c-parfum']);
});

test('relecture : étape 3, une étiquette de rayon supprimé est listée et peut être retirée', async () => {
  const t = await monter({ scenes: [vue('a', { labels: [{ categoryId: 'c-disparu', x: 0.1, y: 0.1 }] })] });
  t.ctl.allerA(3);
  const ligne = t.qa('.ve-rayon').find(li => /Rayon supprimé/.test(li.textContent));
  assert.ok(ligne, 'étiquette orpheline listée');
  [...ligne.querySelectorAll('button')].find(b => b.textContent === 'Retirer').click();
  await t.attendre(); await t.attendre();
  assert.deepEqual(t.appels.at(-1)[1].labels, []);
});

test('relecture : pendant un enregistrement, les noms sont figés et le vendeur est prévenu', async () => {
  let liberer;
  const bloquer = new Promise(r => { liberer = r; });
  const t = await monter({ scenes: [vue('a'), vue('b')], bloquer });
  const premier = t.qa('.ve-view input')[0];
  premier.value = 'Entrée';
  premier.dispatchEvent(new t.w.Event('change'));
  await t.attendre();
  const second = t.qa('.ve-view input')[1];
  assert.equal(second.disabled, true);
  second.value = 'Fond';
  second.dispatchEvent(new t.w.Event('change'));
  await t.attendre();
  assert.match(t.q('#ve-status').textContent, /Patientez/);
  liberer();
  for (let i = 0; i < 5; i++) await t.attendre();
  assert.equal(t.qa('.ve-view input')[1].disabled, false);
  assert.equal(t.appels.filter(a => a[0] === 'enregistrerVue').length, 1);
});

test('relecture : catalogue indisponible, aucun point marqué retiré, publication suspendue, réessai proposé', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })], catalogueEchoue: true });
  assert.match(t.q('#ve-status').textContent, /catalogue/i);
  assert.ok(t.q('#ve-status button'), 'bouton Réessayer');
  t.ctl.allerA(2);
  assert.ok(!t.q('.ve-point').classList.contains('ve-warn'));
  t.ctl.allerA(4);
  assert.equal(t.bouton('Publier ma boutique').disabled, true);
  assert.ok(t.qa('.ve-checks li.ve-ko').some(li => /catalogue/i.test(li.textContent)));
  assert.ok(!t.qa('.ve-checks li').some(li => /plus en vente/.test(li.textContent)));
});

test('relecture : un problème de l étape 4 mène à la photo concernée', async () => {
  const t = await monter({ scenes: [vue('a'), vue('b', { hotspots: [{ productId: 'p2', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(4);
  t.bouton('Corriger').click();
  await t.attendre();
  assert.equal(t.ctl.etat.etape, 2);
  assert.equal(t.ctl.etat.courante, 1);
});


test('finitions : les raisons du refus du serveur disparaissent après un enregistrement réussi', async () => {
  const t = await monter({ scenes: [vue('a')], refusPublication: true });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.ok(t.qa('.ve-checks li.ve-ko').length > 0);
  t.ctl.allerA(1);
  const titre = t.q('.ve-view input');
  titre.value = 'Entrée';
  titre.dispatchEvent(new t.w.Event('change'));
  await t.attendre(); await t.attendre();
  t.ctl.allerA(4);
  assert.equal(t.qa('.ve-checks li.ve-ko').length, 0);
});

test('finitions : un point hors vente est annoncé en toutes lettres, pas seulement en couleur', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p2', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(2);
  assert.match(t.q('.ve-point').getAttribute('aria-label'), /hors vente/);
  t.q('.ve-point').click();
  await t.attendre();
  assert.match(t.q('#ve-panel').textContent, /n’est plus en vente/);
});

test('finitions : un refus du serveur contenant le mot « connexion » est un refus, pas une coupure', async () => {
  const t = await monter({ scenes: [vue('a')], refusEnregistrement: true, messageRefus: 'Reconnexion requise pour cette boutique' });
  const titre = t.q('.ve-view input');
  titre.value = 'Entrée';
  titre.dispatchEvent(new t.w.Event('change'));
  for (let i = 0; i < 4; i++) await t.attendre();
  assert.equal(t.appels.filter(a => a[0] === 'ouvrir').length, 2);
  assert.equal(t.q('#ve-status button'), null);
});

test('finitions : réessayer après l échec de création ne renvoie pas la photo', async () => {
  const t = await monter({ creerEchoue: 1 });
  await choisirFichier(t, '#ve-file', 'entree.jpg');
  t.q('#ve-status button').click();
  for (let i = 0; i < 5; i++) await t.attendre();
  assert.equal(t.appels.filter(a => a[0] === 'envoyerPhoto').length, 1);
  assert.equal(t.appels.filter(a => a[0] === 'creerVue').length, 2);
  assert.equal(t.qa('.ve-view').length, 1);
});

test('finitions : réessayer une étiquette déplacée termine le déplacement', async () => {
  const t = await monter({ scenes: [vue('a', { labels: [{ categoryId: 'c-parfum', x: 0.1, y: 0.1 }] }), vue('b')], echecsEnregistrement: [2] });
  t.ctl.allerA(3);
  t.qa('.ve-rayon')[0].querySelector('button.ve-btn').click();
  await t.attendre();
  t.qa('.ve-tab')[1].click();
  await t.attendre();
  await toucherPhoto(t, 40, 60);
  for (let i = 0; i < 6; i++) await t.attendre();
  t.q('#ve-status button').click();
  for (let i = 0; i < 5; i++) await t.attendre();
  assert.equal(t.ctl.etat.mode, null);
  assert.deepEqual(t.etat.scenes.map(s => s.labels.length), [0, 1]);
});

test('finitions : pendant la publication, le statut le dit', async () => {
  let liberer;
  const t = await monter({ scenes: [vue('a')], bloquerPublication: new Promise(r => { liberer = r; }) });
  t.ctl.allerA(4);
  t.bouton('Publier ma boutique').click();
  await t.attendre(); await t.attendre();
  assert.match(t.q('#ve-status').textContent, /Publication en cours/);
  liberer();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.match(t.q('#ve-status').textContent, /en ligne/);
});

test('finitions : après une action, le focus revient sur le titre de l étape', async () => {
  const t = await monter({ scenes: [vue('a', { hotspots: [{ productId: 'p1', x: 0.5, y: 0.5 }] })] });
  t.ctl.allerA(2);
  const point = t.q('.ve-point');
  point.focus();
  point.click();
  await t.attendre();
  assert.equal(t.w.document.activeElement, t.q('#ve-panel h2'));
});

// ── Vue 360° assemblée à partir des photos du tour ──
async function choisirSerie(t, fichiers) {
  const champ = t.q('#ve-serie');
  Object.defineProperty(champ, 'files', { configurable: true, value: fichiers });
  champ.dispatchEvent(new t.w.Event('change'));
  for (let i = 0; i < 6; i++) await t.attendre();
}
const photoDuTour = (t, nom, heure, type = 'image/jpeg') => new t.w.File(['x'], nom, { type, lastModified: heure });

test('la carte 360° guide le vendeur et ouvre le choix des photos du tour', async () => {
  const t = await monter();
  const carte = t.q('.ve-360-carte');
  assert.ok(carte, 'carte 360°');
  assert.match(carte.textContent, /milieu de la boutique/);
  assert.match(carte.textContent, /photos du tour \(6 à 20\)/);
  assert.ok(t.q('#ve-serie').multiple, 'plusieurs photos à la fois');
});

// ── Filmer ma boutique ──
async function choisirVideo(t, fichier) {
  const champ = t.q('#ve-video');
  Object.defineProperty(champ, 'files', { configurable: true, value: [fichier] });
  champ.dispatchEvent(new t.w.Event('change'));
  for (let i = 0; i < 8; i++) await t.attendre();
}

test('la carte 360° propose d’abord de filmer la boutique, les photos restent possibles', async () => {
  const t = await monter();
  const carte = t.q('.ve-360-carte');
  assert.match(carte.textContent, /Comment filmer/);
  assert.match(carte.textContent, /20 à 30 secondes/);
  const filmer = [...carte.querySelectorAll('button')].find(b => /Filmer ma boutique/.test(b.textContent));
  assert.ok(filmer, 'bouton Filmer ma boutique');
  assert.ok(filmer.classList.contains('ve-primary'), 'c’est le choix principal');
  assert.ok([...carte.querySelectorAll('button')].some(b => /photos du tour/.test(b.textContent)), 'les photos restent possibles');
  assert.match(t.q('#ve-video').getAttribute('accept'), /video/);
});

test('une vidéo du tour devient des images, assemblées en une vue 360°', async () => {
  const t = await monter();
  const series = [];
  t.api.videoEnImages = async (fichier, suivi) => {
    suivi('Préparation de la vidéo : image 1 sur 18…');
    return { success: true, fichiers: Array.from({ length: 18 }, (_, i) => new t.w.File(['x'], `image-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg', lastModified: 1000 + i })) };
  };
  t.api.assembler360 = async fichiers => { series.push(Array.from(fichiers, f => f.name)); return { success: true, url: 'https://ex.test/vue-360.jpg' }; };
  await choisirVideo(t, new t.w.File(['v'], 'tour.mp4', { type: 'video/mp4' }));
  assert.equal(series.length, 1);
  assert.equal(series[0].length, 18);
  assert.equal(series[0][0], 'image-01.jpg');
  assert.equal(series[0][17], 'image-18.jpg');
  assert.deepEqual(t.appels.at(-1), ['creerVue', { title: 'Vue 360°', imageUrl: 'https://ex.test/vue-360.jpg' }]);
  assert.match(t.q('#ve-status').textContent, /Vue 360° créée/);
});

test('une vidéo illisible ou trop courte : message clair, rien n’est envoyé', async () => {
  const t = await monter();
  let envoye = false;
  t.api.videoEnImages = async () => ({ success: false, message: 'La vidéo est trop courte : filmez 20 à 30 secondes en faisant un tour complet sur vous-même.' });
  t.api.assembler360 = async () => { envoye = true; return { success: true, url: 'x' }; };
  await choisirVideo(t, new t.w.File(['v'], 'tour.mp4', { type: 'video/mp4' }));
  assert.equal(envoye, false);
  assert.match(t.q('#ve-status').textContent, /trop courte/);
});

test('un fichier qui n’est pas une vidéo est refusé avant tout traitement', async () => {
  const t = await monter();
  let traite = false;
  t.api.videoEnImages = async () => { traite = true; return { success: true, fichiers: [] }; };
  await choisirVideo(t, new t.w.File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
  assert.equal(traite, false);
  assert.match(t.q('#ve-status').textContent, /vidéo/);
});

test('les photos du tour sont assemblées dans l’ordre de prise, puis deviennent une vue', async () => {
  const t = await monter();
  const appelsSerie = [];
  t.api.assembler360 = async fichiers => { appelsSerie.push(Array.from(fichiers, f => f.name)); return { success: true, url: 'https://ex.test/vue-360.jpg' }; };
  const fichiers = [7, 3, 1, 5, 2, 6, 4].map(k => photoDuTour(t, `IMG_${k}.jpg`, 1000 + k));
  await choisirSerie(t, fichiers);
  assert.deepEqual(appelsSerie, [['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg', 'IMG_4.jpg', 'IMG_5.jpg', 'IMG_6.jpg', 'IMG_7.jpg']]);
  assert.deepEqual(t.appels.at(-1), ['creerVue', { title: 'Vue 360°', imageUrl: 'https://ex.test/vue-360.jpg' }]);
  assert.equal(t.qa('.ve-view').length, 1);
  assert.match(t.q('#ve-status').textContent, /Vue 360° créée/);
});

test('moins de 6 photos : refusé avant tout envoi', async () => {
  const t = await monter();
  let appele = false;
  t.api.assembler360 = async () => { appele = true; return { success: true, url: 'x' }; };
  await choisirSerie(t, [1, 2, 3].map(k => photoDuTour(t, `IMG_${k}.jpg`, k)));
  assert.equal(appele, false);
  assert.match(t.q('#ve-status').textContent, /au moins 6 photos/);
  assert.ok(t.q('#ve-status').classList.contains('ve-error'));
});

test('photos à reprendre : le message de l’assemblage est montré au vendeur', async () => {
  const t = await monter();
  const message = 'Le tour n’est pas complet : continuez à tourner jusqu’à revenir à votre point de départ.';
  t.api.assembler360 = async () => ({ success: false, message });
  await choisirSerie(t, [1, 2, 3, 4, 5, 6].map(k => photoDuTour(t, `IMG_${k}.jpg`, k)));
  assert.equal(t.q('#ve-status').textContent, message);
  assert.equal(t.qa('.ve-view').length, 0);
});

test('coupure après l’assemblage : « Réessayer » crée la vue sans tout réassembler', async () => {
  const t = await monter({ creerEchoue: 1 });
  let assemblages = 0;
  t.api.assembler360 = async () => { assemblages += 1; return { success: true, url: 'https://ex.test/vue-360.jpg' }; };
  await choisirSerie(t, [1, 2, 3, 4, 5, 6].map(k => photoDuTour(t, `IMG_${k}.jpg`, k)));
  assert.match(t.q('#ve-status').textContent, /Non enregistré/);
  t.q('#ve-status button').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.equal(assemblages, 1);
  assert.equal(t.qa('.ve-view').length, 1);
});

// ── Étape 1 : choix 360° / photo simple, assemblage des photos déjà là, aperçu ──
const sixVues = () => [1, 2, 3, 4, 5, 6].map(k => vue('v' + k, { title: 'Photo ' + k }));

test('étape 1 : deux choix côte à côte, 360° conseillé, chaque photo étiquetée', async () => {
  const t = await monter({ scenes: [vue('a')] });
  const cartes = t.qa('.ve-choix .ve-choix-carte');
  assert.equal(cartes.length, 2);
  assert.match(cartes[0].textContent, /Vue 360° de ma boutique/);
  assert.match(cartes[0].textContent, /Conseillé/);
  assert.match(cartes[1].textContent, /photo d’un rayon ou d’un mur/);
  assert.equal(t.q('.ve-view .ve-genre').textContent, 'Photo simple');
});

test('six photos ajoutées une par une : on propose de les assembler en 360°', async () => {
  const t = await monter({ scenes: sixVues() });
  assert.match(t.q('.ve-assembler h3').textContent, /Vos 6 photos font le tour/);
  const peu = await monter({ scenes: sixVues().slice(0, 5) });
  assert.equal(peu.q('.ve-assembler'), null, 'moins de 6 : rien à assembler');
});

test('assembler : photos dans l’ordre de la liste, vue 360° créée, photos séparées retirées sur accord', async () => {
  const t = await monter({ scenes: sixVues() });
  const recues = [];
  t.api.assemblerVues = async adresses => { recues.push(Array.from(adresses)); return { success: true, url: 'https://ex.test/tour-360.jpg' }; };
  t.bouton('Assembler ces photos en 360°').click();
  for (let i = 0; i < 12; i++) await t.attendre();
  assert.deepEqual(recues, [[1, 2, 3, 4, 5, 6].map(k => 'https://ex.test/v' + k + '.jpg')]);
  assert.ok(t.appels.some(a => a[0] === 'creerVue' && a[1].title === 'Vue 360°' && a[1].imageUrl === 'https://ex.test/tour-360.jpg'));
  assert.match(t.confirmations.at(-1), /Retirer les 6 photos séparées/);
  assert.equal(t.appels.filter(a => a[0] === 'supprimerVue').length, 6);
  assert.deepEqual(t.qa('.ve-view .ve-title').map(i => i.value), ['Vue 360°']);
});

test('assembler sans retirer : les photos séparées restent si le vendeur refuse', async () => {
  const t = await monter({ scenes: sixVues(), refuserConfirmation: true });
  t.api.assemblerVues = async () => ({ success: true, url: 'https://ex.test/tour-360.jpg' });
  t.bouton('Assembler ces photos en 360°').click();
  for (let i = 0; i < 12; i++) await t.attendre();
  assert.equal(t.appels.filter(a => a[0] === 'supprimerVue').length, 0);
  assert.equal(t.qa('.ve-view').length, 7);
});

test('une vue 360° s’affiche en aperçu à l’étape 1, et la vignette touchée devient l’aperçu', async () => {
  const t = await monter({ scenes: [vue('a', { imageUrl: 'https://ex.test/a-360.jpg' }), vue('b', { imageUrl: 'https://ex.test/b-360.jpg' })] });
  t.w.Vue360 = {
    detecter: url => Promise.resolve(url.includes('360')),
    creer: o => { const racine = t.w.document.createElement('div'); racine.className = 'v360'; racine.dataset.vue = o.libelle; return { racine, points: () => {}, charger: () => Promise.resolve() }; }
  };
  t.q('#ve-steps button[data-etape="1"]').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.match(t.q('#ve-panel').textContent, /Aperçu : tournez dans votre boutique/);
  assert.equal(t.qa('.ve-view .v360-badge').length, 2);
  assert.equal(t.q('#ve-panel .v360').dataset.vue, 'Photo 360° : Vue b', 'la dernière vue 360° par défaut');
  t.qa('.ve-vignette')[0].click();
  for (let i = 0; i < 3; i++) await t.attendre();
  assert.equal(t.q('#ve-panel .v360').dataset.vue, 'Photo 360° : Vue a');
  assert.ok(t.qa('.ve-view')[0].classList.contains('ve-actif'));
});

// ── Partie 2a : entourer un article sur une photo à plat ──
function glisser(t, cadre, de, a) {
  const ev = (type, x, y) => cadre.dispatchEvent(new t.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  ev('pointerdown', de[0], de[1]);
  ev('pointermove', (de[0] + a[0]) / 2, (de[1] + a[1]) / 2);
  ev('pointermove', a[0], a[1]);
  ev('pointerup', a[0], a[1]);
  ev('click', a[0], a[1]);
}

test('entourer un article puis le choisir : la zone est enregistrée avec le produit', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.q('#ve-steps button[data-etape="2"]').click();
  await t.attendre();
  const cadre = t.q('.ve-photo');
  t.q('.ve-photo img').getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  glisser(t, cadre, [20, 10], [60, 50]);
  await t.attendre();
  assert.ok(t.q('.ve-cible.ve-cible-zone'), 'la zone tracée est montrée');
  t.qa('.ve-product')[0].click();
  for (let i = 0; i < 5; i++) await t.attendre();
  const envoi = t.appels.filter(a => a[0] === 'enregistrerVue').at(-1)[1];
  assert.deepEqual(JSON.parse(JSON.stringify(envoi.hotspots)), [{ productId: envoi.hotspots[0].productId, x: 0.2, y: 0.3, w: 0.2, h: 0.4 }]);
  assert.ok(t.q('.ve-point.ve-zone'), 'la zone est dessinée sur la photo');
  assert.match(t.q('.ve-point.ve-zone').getAttribute('aria-label'), /^Zone 1/);
});

test('un toucher simple pose toujours un point, sans zone', async () => {
  const t = await monter({ scenes: [vue('a')] });
  t.q('#ve-steps button[data-etape="2"]').click();
  await t.attendre();
  t.q('.ve-photo img').getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  t.q('.ve-photo').dispatchEvent(new t.w.MouseEvent('click', { bubbles: true, clientX: 100, clientY: 50 }));
  await t.attendre();
  assert.ok(t.q('.ve-cible'));
  assert.equal(t.q('.ve-cible-zone'), null);
});

// ── Partie 2b : l'IA reconnaît l'article entouré ──
async function avecZoneChoisie(t) {
  t.q('#ve-steps button[data-etape="2"]').click();
  await t.attendre();
  t.q('.ve-photo img').getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  glisser(t, t.q('.ve-photo'), [20, 10], [60, 50]);
  await t.attendre();
}
function iaFactice(t, reponse) {
  const appels = [];
  t.api.decouper = async (url, zone) => { appels.push(['decouper', url, JSON.parse(JSON.stringify(zone))]); return { success: true, image: 'data:image/jpeg;base64,QQ==' }; };
  t.api.identifierImage = async image => { appels.push(['identifier', image]); return reponse; };
  t.api.categories = async () => ({ success: true, data: [{ id: 'c-chaussures', name: 'Chaussures', emoji: '👟' }] });
  t.api.envoyerPhotoProduit = async image => { appels.push(['photo', image]); return { success: true, url: 'https://ex.test/produit.jpg' }; };
  t.api.creerProduit = async p => { appels.push(['creer', JSON.parse(JSON.stringify(p))]); return { success: true, data: { id: 'p-nouveau', name: p.name, status: 'ACTIVE' } }; };
  return appels;
}
const attendreBeaucoup = async t => { for (let i = 0; i < 10; i++) await t.attendre(); };

test('IA : l’article reconnu dans le catalogue s’associe en un geste', async () => {
  const t = await monter({ scenes: [vue('a')] });
  await avecZoneChoisie(t);
  const premier = t.qa('.ve-product')[0].textContent;
  const appels = iaFactice(t, { success: true, data: { lisible: true, description: 'Un flacon doré', correspondances: [{ productId: PRODUITS[0].id, nom: premier, raison: 'même flacon' }], proposition: { nom: '', description: '', categorieId: null } } });
  t.bouton('Reconnaître avec l’IA').click();
  await attendreBeaucoup(t);
  assert.deepEqual(appels[0], ['decouper', 'https://ex.test/a.jpg', { x: 0.2, y: 0.3, w: 0.2, h: 0.4 }], 'la zone tracée ; la marge est ajoutée par les règles');
  assert.match(t.q('.ve-ia-vu').textContent, /Un flacon doré/);
  t.bouton('Associer à « ' + premier + ' »').click();
  await attendreBeaucoup(t);
  const envoi = t.appels.filter(a => a[0] === 'enregistrerVue').at(-1)[1];
  assert.equal(envoi.hotspots[0].productId, PRODUITS[0].id);
  assert.equal(envoi.hotspots[0].w, 0.2);
});

test('IA : fiche proposée, le vendeur met son prix, le produit est créé avec la photo puis placé', async () => {
  const t = await monter({ scenes: [vue('a')] });
  await avecZoneChoisie(t);
  const appels = iaFactice(t, { success: true, data: { lisible: true, description: 'Baskets rouges', correspondances: [], proposition: { nom: 'Baskets rouges', description: 'Baskets en toile rouge.', categorieId: 'c-chaussures' } } });
  t.bouton('Reconnaître avec l’IA').click();
  await attendreBeaucoup(t);
  t.bouton('Créer la fiche « Baskets rouges »').click();
  await attendreBeaucoup(t);
  const champs = t.qa('.ve-fiche .ve-champ input, .ve-fiche .ve-champ textarea, .ve-fiche .ve-champ select');
  assert.equal(champs[0].value, 'Baskets rouges');
  assert.equal(champs[2].value, 'c-chaussures');
  // Sans prix : refusé, rien n'est envoyé.
  t.bouton('Créer et placer ce produit').click();
  await t.attendre();
  assert.equal(t.q('#ve-status').textContent, 'Indiquez votre prix en FCFA.');
  assert.ok(!appels.some(a => a[0] === 'creer'));
  const prix = t.qa('.ve-fiche .ve-champ input')[1];
  prix.value = '25000';
  prix.dispatchEvent(new t.w.Event('input'));
  t.bouton('Créer et placer ce produit').click();
  await attendreBeaucoup(t);
  assert.deepEqual(appels.find(a => a[0] === 'photo'), ['photo', 'data:image/jpeg;base64,QQ==']);
  assert.deepEqual(appels.find(a => a[0] === 'creer')[1], { name: 'Baskets rouges', description: 'Baskets en toile rouge.', price: 25000, stock: 1, categoryId: 'c-chaussures', images: ['https://ex.test/produit.jpg'] });
  const envoi = t.appels.filter(a => a[0] === 'enregistrerVue').at(-1)[1];
  assert.equal(envoi.hotspots[0].productId, 'p-nouveau');
  assert.match(t.q('#ve-status').textContent, /Fiche « Baskets rouges » créée et placée/);
});

test('IA non activée : le message est montré, la liste du catalogue reste disponible', async () => {
  const t = await monter({ scenes: [vue('a')] });
  await avecZoneChoisie(t);
  iaFactice(t, { success: false, message: 'La reconnaissance par IA n’est pas encore activée.' });
  t.bouton('Reconnaître avec l’IA').click();
  await attendreBeaucoup(t);
  assert.equal(t.q('.ve-ia-erreur').textContent, 'La reconnaissance par IA n’est pas encore activée.');
  assert.ok(t.qa('.ve-product').length > 0);
});

test('IA : article flou, on propose une photo de près', async () => {
  const t = await monter({ scenes: [vue('a')] });
  await avecZoneChoisie(t);
  iaFactice(t, { success: true, data: { lisible: false, description: '', correspondances: [], proposition: { nom: '', description: '', categorieId: null } } });
  t.bouton('Reconnaître avec l’IA').click();
  await attendreBeaucoup(t);
  assert.ok(t.bouton('Photo de l’article de près'));
  assert.equal(t.q('#ve-photo-produit').getAttribute('capture'), 'environment');
});
