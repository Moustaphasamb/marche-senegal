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
    catalogue: () => ok(init.produits || PRODUITS),
    creerVue: v => { appels.push(['creerVue', copie(v)]); const s = vue('n' + (++n), { title: v.title, imageUrl: v.imageUrl }); etat.scenes.push(s); return ok(s); },
    enregistrerVue: v => {
      appels.push(['enregistrerVue', copie(v)]);
      if (init.refusEnregistrement) return Promise.resolve({ success: false, message: 'Scène introuvable' });
      etat.scenes = etat.scenes.map(s => (s.id === v.id ? copie(v) : s)); return ok(v);
    },
    supprimerVue: id => { appels.push(['supprimerVue', id]); etat.scenes = etat.scenes.filter(s => s.id !== id); return ok({ id }); },
    ordonnerVues: ids => { appels.push(['ordonnerVues', ids]); etat.scenes = ids.map(id => etat.scenes.find(s => s.id === id)); return ok({ ids }); },
    ordonnerRayons: ids => { appels.push(['ordonnerRayons', ids]); etat.rayonOrder = ids; return ok({ rayonOrder: ids }); },
    reprendreVitrine: () => { appels.push(['reprendreVitrine']); const s = vue('vit', { title: 'Vitrine' }); etat.scenes = [s]; return ok(s); },
    publier: () => {
      appels.push(['publier']);
      if (init.refusPublication) return Promise.resolve({ success: false, message: 'Refus', data: { problemes: [{ code: 'produit_inactif', message: '« Vue a » : un point vise un produit qui n’est plus en vente.' }] } });
      return ok({ scenes: etat.scenes, rayonOrder: etat.rayonOrder });
    },
    abandonner: () => { appels.push(['abandonner']); etat.scenes = []; return ok({ abandonne: true }); },
    envoyerPhoto: f => {
      appels.push(['envoyerPhoto', f.name]);
      if (init.envoiEchoue) { init.envoiEchoue -= 1; return Promise.resolve({ success: false, message: 'Erreur de connexion au serveur' }); }
      return Promise.resolve({ success: true, url: 'https://ex.test/' + f.name });
    }
  };
  return { api, appels, etat };
}

async function monter(init = {}) {
  const dom = new JSDOM('<!doctype html><body>' + bloc + '</body>', { url: 'http://localhost:5500/marche-senegal-shopvision.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(lire('vitrine-editeur.js'));
  w.eval(lire('vitrine-editeur-ui.js'));
  const s = serveur(init);
  const confirmations = [];
  const ctl = w.VitrineEditeur.monter({
    api: s.api,
    boutique: { id: 'b1', status: init.statut || 'ACTIVE' },
    lienApercu: 'marche-senegal-boutique.html?id=b1&apercu=brouillon',
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
