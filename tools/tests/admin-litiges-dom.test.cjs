// Le modal d'arbitrage, sans navigateur ni base réelle. JSDOM vient des
// dépendances du dépôt mobile voisin, comme pour shopvision-dom ; aucun service
// externe n'est appelé.
//
// Ce que ce fichier protège : l'admin tranchait sur la seule parole de
// l'acheteur. Le modal montre désormais la version du vendeur, et dit son
// absence au lieu de laisser un blanc. Sans test, ces deux lignes pouvaient
// disparaître d'un écran que personne ne vérifie.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'marche-senegal-admin.html'), 'utf8');

// Le script de cette page est écrit dans le HTML : on l'en extrait pour
// l'évaluer, plutôt que d'en recopier une version qui mentirait vite.
function scriptDeLaPage() {
  const morceaux = [];
  const motif = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let trouve;
  while ((trouve = motif.exec(html)) !== null) morceaux.push(trouve[1]);
  return morceaux.join('\n');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function setup(dossiers) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/marche-senegal-admin.html',
    runScripts: 'outside-only'
  });
  const w = dom.window;

  // Bouchons : un admin connecte, et une API qui ne sert que ces dossiers.
  w.getCurrentUser = () => ({ id: 'admin-1', role: 'ADMIN', firstName: 'Verification' });
  w.isLoggedIn = () => true;
  w.formatPrice = (p) => String(p) + ' FCFA';
  w.toast = () => {};
  w.apiCall = async (url) => {
    if (String(url).includes('/api/admin/disputes')) return { success: true, data: dossiers, meta: { total: dossiers.length, ouverts: dossiers.length } };
    return { success: true, data: [], meta: {} };
  };

  w.eval(scriptDeLaPage());
  await tick();
  // La liste se remplit par le meme chemin que dans le navigateur : un appel
  // a l API. Poser _disputes de force ne prouverait rien du trajet reel.
  await w.loadDisputes();
  return { dom, w, $: (id) => w.document.getElementById(id) };
}

function litige(champs = {}) {
  return {
    id: 'litige-1',
    reason: 'DAMAGED',
    description: 'Le tissu est arrive dechire.',
    status: 'OPEN',
    sellerResponse: null,
    order: {
      orderNumber: 'CMD-2026-0031',
      total: 15000,
      buyer: { firstName: 'Aminata', lastName: 'Diallo' },
      shop: { name: 'Mode Fatou Ndoye' },
      payment: { method: 'WAVE', escrowReleased: false }
    },
    ...champs
  };
}

test('la version du vendeur est affichee a celui qui tranche', async () => {
  const { dom, w, $ } = await setup([litige({
    sellerResponse: 'Remis au livreur intact le 12 septembre, bordereau 4471.',
    sellerRespondedAt: '2026-09-13T15:00:00Z'
  })]);

  w.openDisputeModal(0);

  assert.equal($('disp-seller-response').textContent, 'Remis au livreur intact le 12 septembre, bordereau 4471.');
  // La date situe la defense dans le temps du dossier.
  assert.match($('disp-seller-label').textContent, /13 sept/);
  // La parole de l acheteur n a pas ete remplacee par celle du vendeur.
  assert.equal($('disp-description').textContent, 'Le tissu est arrive dechire.');
  dom.window.close();
});

test('un dossier sans defense le dit, au lieu de laisser un blanc', async () => {
  const { dom, w, $ } = await setup([litige()]);

  w.openDisputeModal(0);

  const texte = $('disp-seller-response').textContent;
  assert.notEqual(texte.trim(), '');
  assert.match(texte, /pas donné sa version/);
  dom.window.close();
});

test('passer d un dossier a l autre ne laisse pas trainer la defense du precedent', async () => {
  const { dom, w, $ } = await setup([
    litige({ id: 'avec', sellerResponse: 'Bordereau 4471, remis intact.', sellerRespondedAt: '2026-09-13T15:00:00Z' }),
    litige({ id: 'sans' })
  ]);

  w.openDisputeModal(0);
  w.openDisputeModal(1);

  // Le piege : un textContent laisse en place ferait lire a l admin la defense
  // d un autre vendeur sur le dossier qu il est en train de juger.
  assert.doesNotMatch($('disp-seller-response').textContent, /4471/);
  assert.match($('disp-seller-response').textContent, /pas donné sa version/);
  dom.window.close();
});
