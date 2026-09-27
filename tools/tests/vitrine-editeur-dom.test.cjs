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
    catalogue: () => (init.catalogueEchoue ? Promise.resolve({ success: false, message: 'Erreur de connexion au serveur' }) : ok(init.produits || PRODUITS)),
    creerVue: v => { appels.push(['creerVue', copie(v)]); const s = vue('n' + (++n), { title: v.title, imageUrl: v.imageUrl }); etat.scenes.push(s); return ok(s); },
    enregistrerVue: v => {
      appels.push(['enregistrerVue', copie(v)]);
      if (init.refusEnregistrement) return Promise.resolve({ success: false, message: 'Scène introuvable' });
      if (init.bloquer) return init.bloquer.then(() => { etat.scenes = etat.scenes.map(s => (s.id === v.id ? copie(v) : s)); return ok(v); });
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
  const apercu = t.qa('#ve-panel a').find(a => /aperçu/i.test(a.textContent));
  assert.equal(apercu.getAttribute('href'), 'marche-senegal-boutique.html?id=b1&apercu=brouillon');
  t.bouton('Publier ma boutique').click();
  for (let i = 0; i < 6; i++) await t.attendre();
  assert.equal(t.confirmations.length, 1);
  assert.ok(t.appels.some(a => a[0] === 'publier'));
  assert.match(t.q('#ve-status').textContent, /en ligne/);
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
