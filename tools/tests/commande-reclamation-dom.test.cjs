// Le formulaire en 3 étapes : motif, articles, photos et description.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirPage, tick } = require('./aide-garantie.cjs');

const H = 3600 * 1000;
const dans = h => new Date(Date.now() + h * H).toISOString();
const commande = (champs = {}) => ({ id: 'o1', status: 'DELIVERED', claimDeadlineAt: dans(30), fundsReleasedAt: null, shop: { name: 'Mode Fatou' },
  items: [{ id: 'i1', name: 'Pot', size: null, quantity: 3 }, { id: 'i2', name: 'Lampe', size: 'L', quantity: 1 }], ...champs });
const PHOTO = { kind: 'PHOTO', url: 'https://res.cloudinary.com/demo/image/upload/v1/preprod/litiges/u/a.jpg' };

async function formulaire(bouchons = {}, cmd = commande()) {
  const ouverte = await ouvrirPage('marche-senegal-commande.html', {
    recherche: '?id=o1', partages: ['garantie.js', 'envoi-preuve.js'],
    bouchons: { getOrder: () => new Promise(() => {}), getMyDisputes: async () => ({ success: true, data: [] }),
      autorisationPreuves: async () => ({ success: true, data: {} }), ...bouchons }
  });
  ouverte.w.EnvoiPreuve = { envoyerPreuve: async () => ({ success: true, preuve: PHOTO }) };
  ouverte.w.renderGarantie([cmd], []);
  ouverte.w.ouvrirFormulaire(cmd.id);
  return ouverte;
}

function decrire(w, $, texte) {
  $('rec-description').value = texte;
  $('rec-description').dispatchEvent(new w.Event('input'));
}

test('motif, articles, puis la photo est exigée avant tout envoi', async () => {
  let envois = 0;
  const { w, $ } = await formulaire({ openDispute: async () => { envois += 1; return { success: true, data: { id: 'd9' } }; } });
  assert.ok($('reclamation-modal').classList.contains('open'));
  assert.equal($('rec-corps').querySelectorAll('input[name="rec-motif"]').length, 6);
  assert.match($('rec-etapes').textContent, /Étape 1 sur 3/);
  w.choisirMotif('DAMAGED');
  w.etapeSuivante();
  assert.match($('rec-etapes').textContent, /Étape 2 sur 3/);
  w.etapeSuivante();
  assert.equal($('rec-erreur').textContent, 'Choisissez au moins un article concerné.');
  w.changerQuantite('i1', 1);
  w.etapeSuivante();
  assert.match($('rec-etapes').textContent, /Étape 3 sur 3/);
  decrire(w, $, 'Le pot est arrivé fendu sur le côté.');
  await w.envoyerReclamation();
  assert.equal($('rec-erreur').textContent, 'Ajoutez au moins une photo du problème.');
  assert.equal(envois, 0);
});

test('avec la photo : une seule réclamation part, puis on va au dossier', async () => {
  const corps = []; const destinations = [];
  const { w, $ } = await formulaire({ openDispute: async c => { corps.push(c); await tick(5); return { success: true, message: 'Réclamation LIT-2026-0020 ouverte.', data: { id: 'd9' } }; } });
  w.allerVers = url => destinations.push(url);
  w.choisirMotif('DAMAGED'); w.etapeSuivante(); w.changerQuantite('i1', 1); w.etapeSuivante();
  decrire(w, $, 'Le pot est arrivé fendu sur le côté.');
  await w.ajouterFichiers([{ name: 'a.jpg' }]);
  assert.equal($('rec-preuves').querySelectorAll('img').length, 1);
  w.envoyerReclamation(); w.envoyerReclamation();
  await tick(30);
  assert.equal(corps.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(corps[0])), { orderId: 'o1', reason: 'DAMAGED', description: 'Le pot est arrivé fendu sur le côté.',
    items: [{ orderItemId: 'i1', quantity: 1 }], preuves: [PHOTO] });
  assert.deepEqual(destinations, ['marche-senegal-reclamation.html?id=d9']);
});

test('pas encore reçu : un seul motif, choisi d’avance, et pas d’étape articles', async () => {
  const { w, $ } = await formulaire({}, commande({ status: 'DELIVERING', claimDeadlineAt: null }));
  assert.equal($('rec-corps').querySelectorAll('input[name="rec-motif"]').length, 1);
  assert.equal($('rec-corps').querySelector('input[name="rec-motif"]').checked, true);
  w.etapeSuivante();
  assert.match($('rec-etapes').textContent, /Étape 2 sur 2/);
  assert.ok($('rec-description'));
});

test('refus du serveur : son message, le formulaire reste utilisable', async () => {
  const { w, $ } = await formulaire({ openDispute: async () => ({ success: false, message: 'Le délai de 48 h pour signaler un problème sur cette commande est dépassé.' }) });
  w.choisirMotif('NOT_RECEIVED'); w.etapeSuivante();
  decrire(w, $, 'Je n’ai jamais reçu ce colis.');
  await w.envoyerReclamation();
  assert.equal($('rec-erreur').textContent, 'Le délai de 48 h pour signaler un problème sur cette commande est dépassé.');
  assert.equal($('rec-suivant').disabled, false);
});

test('photo refusée à l’envoi : message, rien d’ajouté', async () => {
  const { w, $ } = await formulaire();
  w.EnvoiPreuve = { envoyerPreuve: async () => ({ success: false, message: 'Réseau coupé : la photo n’est pas partie. Réessayez.' }) };
  w.choisirMotif('DAMAGED'); w.etapeSuivante(); w.changerQuantite('i1', 1); w.etapeSuivante();
  await w.ajouterFichiers([{ name: 'a.jpg' }]);
  assert.equal(w.formulaire.preuves.length, 0);
  assert.equal($('rec-erreur').textContent, 'Réseau coupé : la photo n’est pas partie. Réessayez.');
});

test('mauvaise taille : la règle de l’erreur de taille est rappelée', async () => {
  const { w, $ } = await formulaire();
  w.choisirMotif('WRONG_SIZE');
  assert.equal($('rec-note-taille').hidden, false);
  assert.match($('rec-note-taille').textContent, /Si vous vous êtes trompé de taille, ce n’est pas couvert/);
});

test('relecture : une photo qui arrive après fermeture du formulaire ne rejoint pas une autre réclamation', async () => {
  const { w, $ } = await formulaire();
  let livrer;
  w.EnvoiPreuve = { envoyerPreuve: () => new Promise(r => { livrer = r; }) };
  w.choisirMotif('DAMAGED'); w.etapeSuivante(); w.changerQuantite('i1', 1); w.etapeSuivante();
  const envoi = w.ajouterFichiers([{ name: 'a.jpg' }]);
  w.fermerFormulaire();
  w.ouvrirFormulaire('o1');
  livrer({ success: true, preuve: PHOTO });
  await envoi;
  assert.equal(w.formulaire.preuves.length, 0);
  assert.equal(w.formulaire.envoisEnCours, 0);
});
