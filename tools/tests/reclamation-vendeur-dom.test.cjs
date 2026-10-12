// Le vendeur répond en un écran : rembourser, proposer, ou contester avec ses photos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirPage, tick } = require('./aide-garantie.cjs');

const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();
const ouvert = (champs = {}) => ({ id: 'd1', number: 'LIT-2026-0005', reason: 'DAMAGED', description: 'Pot fendu.', status: 'OPEN',
  deadlineAt: dans(20), returnStatus: 'NONE', items: [], evidence: [], events: [],
  order: { orderNumber: 'MSM-1', total: 18000, status: 'DELIVERED', shop: { name: 'Mode Fatou' } }, ...champs });

async function vendeur(d, bouchons = {}) {
  const journal = [];
  const ouverte = await ouvrirPage('marche-senegal-reclamation.html', {
    recherche: '?id=d1', partages: ['garantie.js', 'envoi-preuve.js'],
    bouchons: {
      getCurrentUser: () => ({ id: 'u-vendeur', role: 'SELLER' }),
      getDispute: async () => ({ success: true, data: d }),
      proposerSolution: async (id, corps) => { journal.push(['proposition', corps]); return { success: true, message: 'Proposition envoyée à l’acheteur' }; },
      ajouterPreuves: async (id, preuves) => { journal.push(['preuves', preuves]); return { success: true }; },
      autorisationPreuves: async () => ({ success: true, data: {} }),
      ...bouchons
    }
  });
  await tick();
  return { ...ouverte, journal };
}

test('dossier ouvert : les cinq réponses du vendeur', async () => {
  const { $ } = await vendeur(ouvert());
  assert.equal($('dossier-etat').textContent, 'À vous de répondre');
  assert.equal($('dossier-actions').querySelectorAll('input[name="proposition"]').length, 5);
  assert.match($('dossier-actions').textContent, /transport du retour est à votre charge/);
});

test('remboursement partiel : montant exigé, puis envoyé', async () => {
  const { w, $, journal } = await vendeur(ouvert());
  w.choisirProposition('REFUND_PARTIAL');
  await w.envoyerReponseVendeur();
  assert.match($('actions-erreur').textContent, /^Montant entre 1 et 17.999 FCFA\.$/);
  $('montant-partiel').value = '6000';
  await w.envoyerReponseVendeur();
  assert.deepEqual(JSON.parse(JSON.stringify(journal)), [['proposition', { proposal: 'REFUND_PARTIAL', amount: 6000 }]]);
});

test('contester : explication exigée, photos envoyées avant la réponse', async () => {
  const { w, $, journal } = await vendeur(ouvert());
  w.EnvoiPreuve = { envoyerPreuve: async () => ({ success: true, preuve: { kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/v.jpg' } }) };
  w.choisirProposition('CONTEST');
  await w.envoyerReponseVendeur();
  assert.equal($('actions-erreur').textContent, 'Expliquez pourquoi vous contestez (10 caractères au moins).');
  $('reponse-message').value = 'Le pot était intact au départ, photo à l’appui.';
  await w.ajouterPreuvesVendeur([{ name: 'v.jpg' }]);
  w.envoyerReponseVendeur(); w.envoyerReponseVendeur();
  await tick(30);
  assert.deepEqual(journal.map(j => j[0]), ['preuves', 'proposition']);
  assert.equal(journal[1][1].proposal, 'CONTEST');
});

test('en attente du client : plus de formulaire', async () => {
  const { $ } = await vendeur(ouvert({ status: 'AWAITING_BUYER', sellerProposal: 'EXCHANGE' }));
  assert.equal($('dossier-etat').textContent, 'En attente de la réponse du client');
  assert.equal($('dossier-actions').querySelectorAll('input[name="proposition"]').length, 0);
});

test('refus du serveur : son message', async () => {
  const { w, $ } = await vendeur(ouvert(), { proposerSolution: async () => ({ success: false, message: 'Ce dossier n’attend plus votre proposition : notre équipe s’en occupe.' }) });
  w.choisirProposition('REFUND_FULL');
  await w.envoyerReponseVendeur();
  assert.equal($('actions-erreur').textContent, 'Ce dossier n’attend plus votre proposition : notre équipe s’en occupe.');
  assert.equal($('btn-proposer').disabled, false);
});

test('l’acheteur ne voit jamais le formulaire du vendeur', async () => {
  const { $ } = await ouvrirPage('marche-senegal-reclamation.html', {
    recherche: '?id=d1', partages: ['garantie.js', 'envoi-preuve.js'],
    bouchons: { getDispute: async () => ({ success: true, data: ouvert() }) }
  });
  await tick();
  assert.equal($('dossier-actions').querySelectorAll('input[name="proposition"]').length, 0);
});
