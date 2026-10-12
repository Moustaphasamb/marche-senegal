// La file de l'admin : échéance, dossier complet, nouvelles décisions, exécution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(racine, 'marche-senegal-admin.html'), 'utf8');
const garantie = fs.readFileSync(path.join(racine, 'garantie.js'), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 20));
const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();

function scriptDeLaPage() {
  const morceaux = []; const motif = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let t;
  while ((t = motif.exec(html)) !== null) morceaux.push(t[1]);
  return morceaux.join('\n');
}

async function setup(dossiers, detail = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost:5500/marche-senegal-admin.html', runScripts: 'outside-only' });
  const w = dom.window;
  const appels = [];
  w.getCurrentUser = () => ({ id: 'admin-1', role: 'ADMIN' });
  w.isLoggedIn = () => true;
  w.formatPrice = p => String(p) + ' FCFA';
  w.escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  w.urlImageSure = u => (/^https:\/\//.test(u) ? u : '');
  w.toast = () => {};
  w.prompt = () => 'https://preprod.marchesenegal.test/recu.jpg';
  w.apiCall = async (url, options = {}) => {
    appels.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    if (String(url).startsWith('/api/admin/disputes?')) return { success: true, data: dossiers, meta: { ouverts: 1 } };
    if (String(url).startsWith('/api/disputes/')) return { success: true, data: detail };
    return { success: true, data: [] };
  };
  w.eval(garantie);
  w.eval(scriptDeLaPage());
  await tick();
  await w.loadDisputes();
  return { w, $: id => w.document.getElementById(id), appels };
}

const dossier = (champs = {}) => ({
  id: 'd1', number: 'LIT-2026-0007', reason: 'WRONG_SIZE', description: 'Taille S au lieu de L.', status: 'INVESTIGATING',
  deadlineAt: null, createdAt: dans(-3), sellerProposal: 'CONTEST', sellerResponse: 'J’ai envoyé la bonne taille.',
  items: [{ quantity: 1, orderItem: { name: 'Robe', size: 'L', quantity: 1 } }],
  evidence: [{ kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg', authorId: 'u-a' }],
  historiqueAcheteur: { total: 4, enFaveurAcheteur: 1, refuses: 2 },
  order: { orderNumber: 'MSM-9', total: 15000, buyer: { firstName: 'Awa', lastName: 'Fall' }, shop: { name: 'Mode Fatou' },
    payment: null, marketOrder: { payment: { method: 'WAVE', status: 'COMPLETED', escrowReleased: false } } },
  ...champs
});

test('la file montre le numéro, le motif « mauvaise taille » et l’échéance', async () => {
  const { $ } = await setup([dossier({ status: 'OPEN', deadlineAt: dans(5) })]);
  const ligne = $('disputes-tbody').textContent;
  assert.match(ligne, /LIT-2026-0007/);
  assert.match(ligne, /Mauvaise taille/);
  assert.match(ligne, /reste (4|5) h/);
  assert.match(ligne, /Retenu/);
});

test('le dossier complet : articles, photos, historique de l’acheteur et du dossier', async () => {
  const { w, $, appels } = await setup([dossier()], { events: [{ type: 'CONTESTATION', acteur: 'vendeur', message: 'Bonne taille envoyée', createdAt: dans(-1) }] });
  w.openDisputeModal(0);
  await tick();
  assert.match($('disp-items').textContent, /Robe · taille L — 1 sur 1/);
  assert.equal($('disp-evidence').querySelectorAll('img').length, 1);
  assert.match($('disp-history-buyer').textContent, /4 réclamations · 1 en sa faveur · 2 refusées/);
  assert.match($('disp-events').textContent, /Le vendeur conteste · Vendeur/);
  assert.ok(appels.some(a => a.url === '/api/disputes/d1'));
});

test('retour + remboursement : montant envoyé ; refus : 20 caractères exigés', async () => {
  const { w, $, appels } = await setup([dossier()]);
  w.openDisputeModal(0);
  $('disp-outcome').value = 'RETURN_AND_REFUND';
  w.toggleDisputeAmount();
  assert.notEqual($('disp-amount-row').style.display, 'none');
  $('disp-resolution').value = 'Taille reçue différente de la commande.';
  await w.submitDisputeResolution();
  assert.deepEqual(appels.find(a => a.url.endsWith('/resolve')).body,
    { outcome: 'RETURN_AND_REFUND', resolution: 'Taille reçue différente de la commande.', refundAmount: 15000 });

  const autre = await setup([dossier()]);
  autre.w.openDisputeModal(0);
  autre.$('disp-outcome').value = 'REJECTED';
  autre.$('disp-resolution').value = 'Non fondé ici.';
  await autre.w.submitDisputeResolution();
  assert.ok(!autre.appels.some(a => a.url.endsWith('/resolve')));
});

test('exécution : collecte, retour reçu avec preuve, échange remis', async () => {
  const resolu = dossier({ status: 'RESOLVED', outcome: 'EXCHANGE', returnStatus: 'AWAITING_PICKUP', resolvedAt: dans(-1), refundedAt: null });
  const { $, appels } = await setup([resolu]);
  const boutons = [...$('disputes-tbody').querySelectorAll('button')].map(b => b.textContent.trim());
  assert.deepEqual(boutons, ['Produit collecté', 'Retour reçu']);
  $('disputes-tbody').querySelectorAll('button')[1].click();
  await tick();
  assert.deepEqual(appels.find(a => a.url.endsWith('/retour')).body, { etape: 'RECEIVED', proofUrl: 'https://preprod.marchesenegal.test/recu.jpg' });

  const recu = await setup([{ ...resolu, returnStatus: 'RECEIVED' }]);
  assert.deepEqual([...recu.$('disputes-tbody').querySelectorAll('button')].map(b => b.textContent.trim()), ['Bon produit remis']);
});
