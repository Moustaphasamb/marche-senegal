// Le bloc « Achat protégé » de la commande : une décision par commande vendeur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirPage, lire, tick } = require('./aide-garantie.cjs');

const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();
const livree = (champs = {}) => ({ id: 'o1', status: 'DELIVERED', claimDeadlineAt: dans(30), fundsReleasedAt: null,
  shop: { name: 'Mode Fatou' }, items: [{ id: 'i1', name: 'Pot', quantity: 3 }], ...champs });

async function page(bouchons = {}) {
  return ouvrirPage('marche-senegal-commande.html', {
    recherche: '?id=o1',
    partages: ['garantie.js', 'envoi-preuve.js'],
    bouchons: { getOrder: () => new Promise(() => {}), getMyDisputes: async () => ({ success: true, data: [] }), ...bouchons }
  });
}

test('après la réception : temps restant et deux boutons', async () => {
  const { w, $ } = await page();
  w.renderGarantie([livree()], []);
  assert.equal($('garantie-card').style.display, 'block');
  const bloc = $('garantie-blocs');
  assert.match(bloc.textContent, /encore 1 j (5|6) h/);
  assert.match(bloc.textContent, /Sans signalement, le vendeur sera payé/);
  assert.ok(bloc.querySelector('[data-action="conforme"]'));
  assert.ok(bloc.querySelector('[data-action="signaler"]'));
});

test('Panier Marché : un dossier sur une boutique ne cache pas l’autre', async () => {
  const { w, $ } = await page();
  const litige = { id: 'd1', number: 'LIT-2026-0005', orderId: 'o1', status: 'OPEN', createdAt: dans(-1) };
  w.renderGarantie([livree(), livree({ id: 'o2', shop: { name: 'Maison Ndiaye' } })], [litige]);
  const blocs = $('garantie-blocs').querySelectorAll('.gar-bloc');
  assert.equal(blocs.length, 2);
  assert.match(blocs[0].textContent, /Mode Fatou/);
  assert.match(blocs[0].textContent, /LIT-2026-0005/);
  assert.equal(blocs[0].querySelector('a').getAttribute('href'), 'marche-senegal-reclamation.html?id=d1');
  assert.ok(!blocs[0].querySelector('[data-action="conforme"]'));
  assert.ok(blocs[1].querySelector('[data-action="conforme"]'));
});

test('avant la réception : seulement « Je n’ai rien reçu »', async () => {
  const { w, $ } = await page();
  w.renderGarantie([livree({ status: 'DELIVERING', claimDeadlineAt: null })], []);
  const boutons = [...$('garantie-blocs').querySelectorAll('button')].map(b => b.textContent.trim());
  assert.deepEqual(boutons, ['Je n’ai rien reçu']);
});

test('« Tout est conforme » : une seule requête, puis la page se recharge', async () => {
  let appels = 0; let recharge = 0;
  const { w, $ } = await page({ confirmerConforme: async () => { appels += 1; await tick(5); return { success: true, message: 'Merci ! Le vendeur va recevoir son paiement.' }; } });
  w.rechargerPage = () => { recharge += 1; };
  w.renderGarantie([livree()], []);
  const bouton = $('garantie-blocs').querySelector('[data-action="conforme"]');
  bouton.click(); bouton.click();
  await tick(30);
  assert.equal(appels, 1);
  assert.equal(recharge, 1);
  assert.ok(w.__toasts.includes('Merci ! Le vendeur va recevoir son paiement.'));
});

test('refus du serveur : son message, et le bouton redevient utilisable', async () => {
  const { w, $ } = await page({ confirmerConforme: async () => ({ success: false, message: 'Une réclamation est en cours : les fonds restent bloqués.' }) });
  w.renderGarantie([livree()], []);
  const bouton = $('garantie-blocs').querySelector('[data-action="conforme"]');
  bouton.click();
  await tick(20);
  assert.ok(w.__toasts.includes('Une réclamation est en cours : les fonds restent bloqués.'));
  assert.equal(bouton.disabled, false);
});

test('un nom de boutique piégé ne s’exécute pas', async () => {
  const { w, $ } = await page();
  w.renderGarantie([livree(), livree({ id: 'o2', shop: { name: '<img src=x onerror=alert(1)>' } })], []);
  assert.equal($('garantie-blocs').querySelector('img'), null);
  assert.match($('garantie-blocs').textContent, /<img src=x/);
});

test('le faux bouton « en cours de développement » a disparu', () => {
  assert.doesNotMatch(lire('marche-senegal-commande.html'), /Signalement en cours de développement/);
});
