// Page vendeur « Mes stories » avec une API doublée.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 40));
const H = 3600e3;
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

async function page({ quota, stories = [], publier } = {}) {
  const dom = new JSDOM(lire('marche-senegal-mes-stories.html'), { url: 'http://localhost:5500/marche-senegal-mes-stories.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  fenetres.push(w);
  w.eval(lire('api.js'));
  w.getCurrentUser = () => ({ id: 'u1', role: 'SELLER', firstName: 'Awa' });
  w.isLoggedIn = () => true;
  w.getMesStories = async () => ({ success: true, data: { plan: 'FREE', statut: 'ACTIVE', quota: quota || { limite: 1, utilisees: 0, restantes: 1, prochaineA: null }, stories } });
  w.getMyProducts = async () => ({ success: true, data: [{ id: 'p1', name: 'Huile', status: 'ACTIVE' }, { id: 'p2', name: 'Vieux', status: 'INACTIVE' }] });
  const journal = { publications: [], suppressions: [] };
  w.publierStory = async d => { journal.publications.push(d); return publier || { success: true, data: { id: 'n1' } }; };
  w.supprimerStory = async id => { journal.suppressions.push(id); return { success: true }; };
  w.envoyerPhotoStory = async () => ({ success: true, url: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/n.jpg' });
  w.confirm = () => true;
  w.eval(lire('stories.js'));
  w.eval(lire('envoi-video.js'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  // jsdom envoie lui-même DOMContentLoaded après l'analyse : le redéclencher lancerait la page deux fois.
  await tick();
  return { w, d: w.document, journal };
}

test('liste : chiffres, temps restant, produits en vente seulement', async () => {
  const { d } = await page({ stories: [{ id: 's1', mediaType: 'PHOTO', mediaUrl: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/a.jpg', caption: 'Wax', createdAt: new Date(Date.now() - H).toISOString(), expiresAt: new Date(Date.now() + 23 * H - 60000).toISOString(), removedAt: null, product: null, vues: 12, clicsProduit: 3 }] });
  const ligne = d.querySelector('.ms-story');
  assert.match(ligne.textContent, /12 vues/);
  assert.match(ligne.textContent, /3 clics produit/);
  assert.match(ligne.textContent, /encore 22 h/);
  assert.deepEqual([...d.querySelectorAll('#st-produit option')].map(o => o.value), ['', 'p1']);
});

test('limite atteinte : message et bouton désactivé', async () => {
  const { d } = await page({ quota: { limite: 1, utilisees: 1, restantes: 0, prochaineA: new Date(Date.now() + 5 * H - 60000).toISOString() } });
  assert.match(d.getElementById('st-quota').textContent, /Avec le plan Gratuit, vous publiez 1 story par jour\. Votre prochaine story est possible dans 5 h\./);
  assert.equal(d.getElementById('st-choisir').disabled, true);
});

test('publier une photo avec phrase et produit', async () => {
  const { w, d, journal } = await page();
  const fichier = new w.File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
  await w.choisirFichierStory(fichier);
  d.getElementById('st-legende').value = 'Arrivage de wax';
  d.getElementById('st-produit').value = 'p1';
  await w.publierMaStory();
  // Objet créé dans la fenêtre jsdom : on compare son contenu, pas son prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(journal.publications)), [{ mediaType: 'PHOTO', mediaUrl: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/n.jpg', caption: 'Arrivage de wax', productId: 'p1' }]);
});

test('refus du serveur : le message s’affiche et le bouton revient', async () => {
  const { w, d } = await page({ publier: { success: false, message: 'Avec le plan Gratuit, vous publiez 1 story par jour.', data: { prochaineA: null } } });
  await w.choisirFichierStory(new w.File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));
  await w.publierMaStory();
  assert.match(d.getElementById('st-etat').textContent, /plan Gratuit/);
  assert.equal(d.getElementById('st-publier').disabled, false);
});

test('supprimer une story après confirmation', async () => {
  const { d, journal } = await page({ stories: [{ id: 's1', mediaType: 'PHOTO', mediaUrl: 'https://res.cloudinary.com/d/image/upload/v1/x/a.jpg', caption: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + H).toISOString(), removedAt: null, product: null, vues: 0, clicsProduit: 0 }] });
  d.querySelector('.ms-story .st-supprimer').click();
  await tick();
  assert.deepEqual(journal.suppressions, ['s1']);
});

test('menu vendeur : « Mes stories » après « Ma boutique »', () => {
  const menu = lire('marche-senegal-menu-vendeur.js');
  assert.match(menu, /cle: 'boutique'[^\n]*\n\s*\{ cle: 'stories', icone: '📸', texte: 'Mes stories', href: 'marche-senegal-mes-stories\.html' \}/);
  assert.match(menu, /'marche-senegal-mes-stories\.html':\s*'stories'/);
});

test('revue : une photo trop lourde est refusée avant l’envoi', async () => {
  const { w, d } = await page();
  let envois = 0;
  w.envoyerPhotoStory = async () => { envois++; return { success: true, url: 'x' }; };
  await w.choisirFichierStory(new w.File([new Uint8Array(5 * 1024 * 1024 + 10)], 'grosse.jpg', { type: 'image/jpeg' }));
  await w.publierMaStory();
  assert.equal(envois, 0);
  assert.match(d.getElementById('st-etat').textContent, /5 Mo/);
});

test('revue : après un échec, le nouvel essai réutilise le fichier déjà envoyé', async () => {
  const { w } = await page();
  let envois = 0;
  let essais = 0;
  w.envoyerPhotoStory = async () => { envois++; return { success: true, url: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/n.jpg' }; };
  w.publierStory = async () => { essais++; return essais === 1 ? { success: false, message: 'Erreur de connexion au serveur' } : { success: true, data: { id: 'n1' } }; };
  await w.choisirFichierStory(new w.File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));
  await w.publierMaStory();
  await w.publierMaStory();
  assert.equal(essais, 2);
  assert.equal(envois, 1);
});
