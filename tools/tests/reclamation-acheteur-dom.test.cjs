// Le dossier vu par l'acheteur : état, échéance, proposition, historique.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirPage, tick } = require('./aide-garantie.cjs');

const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();
const dossierType = (champs = {}) => ({
  id: 'd1', number: 'LIT-2026-0006', reason: 'INCOMPLETE', description: 'Il manque un des trois pots.',
  status: 'AWAITING_BUYER', deadlineAt: dans(30), sellerProposal: 'REFUND_PARTIAL', sellerProposalAmount: 6000,
  sellerResponse: 'Je rembourse le pot manquant.', outcome: null, returnStatus: 'NONE',
  items: [{ quantity: 1, orderItem: { name: 'Pot', size: null, quantity: 3 } }],
  evidence: [{ kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg', auteur: 'acheteur', createdAt: dans(-2) }],
  events: [
    { type: 'OUVERT', acteur: 'acheteur', message: 'Il manque un des trois pots.', createdAt: dans(-2) },
    { type: 'PROPOSITION', acteur: 'vendeur', message: '<script>alert(1)</script>', createdAt: dans(-1) }
  ],
  order: { orderNumber: 'MSM-2026-AB12-01', total: 18000, status: 'DELIVERED', shop: { name: 'Mode Fatou' } },
  ...champs
});

async function page(d, bouchons = {}) {
  let lectures = 0;
  const ouverte = await ouvrirPage('marche-senegal-reclamation.html', {
    recherche: '?id=d1', partages: ['garantie.js', 'envoi-preuve.js'],
    bouchons: { getDispute: async () => { lectures += 1; return d ? { success: true, data: d } : { success: false, message: 'Litige introuvable' }; }, ...bouchons }
  });
  await tick();
  return { ...ouverte, lectures: () => lectures };
}

test('la proposition du vendeur est claire, avec l’échéance', async () => {
  const { $ } = await page(dossierType());
  assert.equal($('dossier-numero').textContent, 'LIT-2026-0006');
  assert.equal($('dossier-etat').textContent, 'Le vendeur vous fait une proposition');
  assert.match($('dossier-echeance').textContent, /encore 1 j (5|6) h/);
  assert.match($('dossier-proposition').textContent, /Rembourser une partie — 6.000 FCFA/);
  assert.match($('dossier-articles').textContent, /Pot — 1 sur 3/);
  assert.ok($('btn-accepter'));
  assert.ok($('btn-refuser'));
});

test('accepter : une seule requête, puis le dossier est relu', async () => {
  let accords = 0;
  const { w, $, lectures } = await page(dossierType(), { accepterProposition: async () => { accords += 1; await tick(5); return { success: true, message: 'Accord enregistré.' }; } });
  $('btn-accepter').click(); $('btn-accepter').click();
  await tick(40);
  assert.equal(accords, 1);
  assert.equal(lectures(), 2);
  assert.ok(w.__toasts.includes('Accord enregistré.'));
});

test('refuser transmet le message facultatif', async () => {
  const recus = [];
  const { $ } = await page(dossierType(), { refuserProposition: async (id, message) => { recus.push([id, message]); return { success: true, message: 'Dossier transmis' }; } });
  $('refus-message').value = 'Je veux un remboursement complet.';
  $('btn-refuser').click();
  await tick(20);
  assert.deepEqual(recus, [['d1', 'Je veux un remboursement complet.']]);
});

test('l’historique se lit sans exécuter le texte reçu', async () => {
  const { $ } = await page(dossierType());
  const historique = $('dossier-historique');
  assert.equal(historique.querySelector('script'), null);
  assert.match(historique.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(historique.textContent, /Proposition du vendeur · Vendeur/);
});

test('dossier clos et remboursé : référence visible, plus aucune action', async () => {
  const { $ } = await page(dossierType({ status: 'CLOSED', outcome: 'REFUND_BUYER', refundAmount: 6000, refundReference: 'WAVE-123', refundedAt: dans(-1), resolution: 'Proposition acceptée.' }));
  assert.match($('dossier-decision').textContent, /Remboursement — 6.000 FCFA/);
  assert.match($('dossier-decision').textContent, /référence WAVE-123/);
  assert.equal($('dossier-actions').querySelectorAll('button').length, 0);
});

test('dossier introuvable : message clair', async () => {
  const { $ } = await page(null);
  assert.match($('dossier-introuvable').textContent, /Réclamation introuvable/);
});

test('ajouter des photos pendant l’examen', async () => {
  const envoyees = [];
  const { w, $ } = await page(dossierType({ status: 'INVESTIGATING', sellerProposal: 'CONTEST' }), {
    ajouterPreuves: async (id, preuves) => { envoyees.push([id, preuves]); return { success: true, message: 'Preuves ajoutées au dossier' }; },
    autorisationPreuves: async () => ({ success: true, data: {} })
  });
  w.EnvoiPreuve = { envoyerPreuve: async () => ({ success: true, preuve: { kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/b.jpg' } }) };
  assert.ok($('preuves-fichiers'));
  await w.ajouterPreuvesDossier([{ name: 'b.jpg' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(envoyees)), [['d1', [{ kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/b.jpg' }]]]);
});
