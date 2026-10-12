// La liste des réclamations du vendeur : la plus pressée en tête, un lien par dossier.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const { lire, tick } = require('./aide-garantie.cjs');

const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();

async function liste(litiges) {
  const dom = new JSDOM('<div id="litiges-resume"></div><div id="litiges-liste"></div>', { url: 'http://localhost:5500/marche-senegal-dashboard.html', runScripts: 'outside-only' });
  const w = dom.window;
  const badges = {};
  await tick();  // le DOMContentLoaded de la page est passé : seul loadLitiges tourne
  w.eval(lire('garantie.js'));
  w.getCurrentUser = () => ({ id: 'u-vendeur', role: 'SELLER' });
  w.isLoggedIn = () => true;
  w.getShopDisputes = async () => ({ success: true, data: litiges });
  w.majBadgeMenu = (id, n) => { badges[id] = n; };
  w.formatPrice = p => p + ' FCFA';
  w.eval(lire('marche-senegal-dashboard-script.js'));
  await w.loadLitiges();
  await tick();
  return { w, $: id => w.document.getElementById(id), badges };
}

test('une ligne par dossier, avec compte à rebours et lien', async () => {
  const { $, badges } = await liste([
    { id: 'd1', number: 'LIT-2026-0005', reason: 'DAMAGED', status: 'OPEN', deadlineAt: dans(6), order: { orderNumber: 'MSM-1' } },
    { id: 'd2', number: 'LIT-2026-0006', reason: 'INCOMPLETE', status: 'AWAITING_BUYER', deadlineAt: dans(40), order: { orderNumber: 'MSM-2' } },
    { id: 'd3', number: 'LIT-2026-0001', reason: 'NOT_RECEIVED', status: 'CLOSED', deadlineAt: null, order: { orderNumber: 'MSM-0' } }
  ]);
  const lignes = $('litiges-liste').querySelectorAll('a.reclamation-ligne');
  assert.equal(lignes.length, 3);
  assert.equal(lignes[0].getAttribute('href'), 'marche-senegal-reclamation.html?id=d1');
  assert.match(lignes[0].textContent, /LIT-2026-0005 · Le produit est abîmé/);
  assert.match(lignes[0].textContent, /À vous de répondre/);
  assert.match(lignes[0].textContent, /reste (5|6) h/);
  assert.ok(lignes[0].classList.contains('urgent'));
  assert.match($('litiges-resume').textContent, /1 à traiter · 2 en cours sur 3/);
  assert.equal(badges['sb-badge-litiges'], 1);
});

test('aucune réclamation : la bonne nouvelle', async () => {
  const { $ } = await liste([]);
  assert.match($('litiges-liste').textContent, /Aucune réclamation/);
});
