// Règles d'affichage de la garantie Achat protégé, sans navigateur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../garantie.js');

const T = new Date('2026-10-12T10:00:00Z');
const H = 3600 * 1000;
const plus = h => new Date(T.getTime() + h * H).toISOString();
const commande = (champs = {}) => ({
  id: 'o1', status: 'DELIVERED', claimDeadlineAt: plus(30), fundsReleasedAt: null,
  items: [{ id: 'i1', name: 'Pot', quantity: 3 }, { id: 'i2', name: 'Lampe', quantity: 1 }],
  ...champs
});
const photo = { kind: 'PHOTO', url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg' };

test('temps restant lisible, rien quand l’échéance est passée', () => {
  assert.equal(G.tempsRestant(plus(49), T), '2 j 1 h');
  assert.equal(G.tempsRestant(plus(5.5), T), '5 h 30 min');
  assert.equal(G.tempsRestant(plus(0.2), T), '12 min');
  assert.equal(G.tempsRestant(plus(-1), T), null);
  assert.equal(G.tempsRestant(null, T), null);
});

test('les dates sont dites à l’heure de Dakar', () => {
  assert.equal(G.dateDakar('2026-10-14T15:30:00Z'), '14/10 à 15h30');
});

test('après la réception, la fenêtre de 48 h est ouverte', () => {
  const e = G.etatGarantie(commande(), [], T);
  assert.equal(e.cas, 'FENETRE');
  assert.equal(e.reste, '1 j 6 h');
});

test('un dossier ouvert passe avant tout, mais seulement pour sa commande', () => {
  const litige = { id: 'd1', orderId: 'o1', status: 'AWAITING_BUYER', createdAt: plus(-2) };
  assert.equal(G.etatGarantie(commande(), [litige], T).cas, 'DOSSIER');
  assert.equal(G.etatGarantie(commande({ id: 'o2' }), [litige], T).cas, 'FENETRE');
});

test('versé, délai passé, avant réception, sans date de fin, annulée', () => {
  assert.equal(G.etatGarantie(commande({ fundsReleasedAt: plus(-1) }), [], T).cas, 'REGLEE');
  assert.equal(G.etatGarantie(commande({ claimDeadlineAt: plus(-1) }), [], T).cas, 'FERMEE');
  assert.equal(G.etatGarantie(commande({ status: 'READY', claimDeadlineAt: null }), [], T).cas, 'AVANT_RECEPTION');
  const sansFin = G.etatGarantie(commande({ claimDeadlineAt: null }), [], T);
  assert.equal(sansFin.cas, 'FENETRE');
  assert.equal(sansFin.reste, null);
  assert.equal(G.etatGarantie(commande({ status: 'CANCELLED' }), [], T, { paye: true }).cas, 'ANNULEE');
  assert.equal(G.etatGarantie(commande({ status: 'CANCELLED' }), [], T, { paye: false }).cas, 'AUCUN');
});

test('un dossier clos reste joignable depuis la commande', () => {
  const clos = { id: 'd0', orderId: 'o1', status: 'CLOSED', createdAt: plus(-5) };
  assert.equal(G.etatGarantie(commande({ fundsReleasedAt: plus(-1) }), [clos], T).litige.id, 'd0');
});

test('motifs possibles selon l’étape de la commande', () => {
  assert.deepEqual(G.motifsPossibles(commande({ status: 'READY' })), ['NOT_RECEIVED']);
  assert.deepEqual(G.motifsPossibles(commande({ status: 'CANCELLED' })), ['NOT_REFUNDED']);
  assert.equal(G.motifsPossibles(commande()).length, 6);
  assert.ok(!G.motifsPossibles(commande()).includes('OTHER'));
});

test('le dossier est refusé tôt, comme le serveur le refuserait', () => {
  const base = { reason: 'DAMAGED', description: 'Le pot est arrivé fendu.', articles: [{ orderItemId: 'i1', quantity: 1 }], preuves: [photo] };
  assert.equal(G.validerDossier(base, commande()), null);
  assert.equal(G.validerDossier({ ...base, preuves: [] }, commande()), 'Ajoutez au moins une photo du problème.');
  assert.equal(G.validerDossier({ ...base, articles: [] }, commande()), 'Choisissez au moins un article concerné.');
  assert.equal(G.validerDossier({ ...base, articles: [{ orderItemId: 'i1', quantity: 4 }] }, commande()), 'Vérifiez les quantités.');
  assert.equal(G.validerDossier({ ...base, description: 'court' }, commande()), 'Décrivez le problème en 10 à 1000 caractères.');
  assert.equal(G.validerDossier({ ...base, preuves: Array(6).fill(photo) }, commande()), '5 photos et 1 vidéo au plus.');
  assert.equal(G.validerDossier({ reason: 'NOT_RECEIVED', description: 'Rien reçu du tout.', articles: [], preuves: [] }, commande()), null);
  assert.equal(G.validerDossier({ ...base, reason: 'OTHER' }, commande()), 'Choisissez ce qui ne va pas.');
});

test('le corps envoyé ne contient que les articles choisis', () => {
  const corps = G.corpsDossier({ reason: 'INCOMPLETE', description: '  Il manque un pot.  ',
    articles: [{ orderItemId: 'i1', quantity: 1 }, { orderItemId: 'i2', quantity: 0 }], preuves: [{ ...photo, apercu: 'x' }] }, commande());
  assert.deepEqual(corps, { orderId: 'o1', reason: 'INCOMPLETE', description: 'Il manque un pot.',
    items: [{ orderItemId: 'i1', quantity: 1 }], preuves: [{ kind: 'PHOTO', url: photo.url }] });
});

test('le vendeur ne répond que quand c’est à lui', () => {
  assert.deepEqual(G.actionsVendeur({ status: 'OPEN' }), ['REFUND_FULL', 'REFUND_PARTIAL', 'RETURN_AND_REFUND', 'EXCHANGE', 'CONTEST']);
  assert.deepEqual(G.actionsVendeur({ status: 'AWAITING_BUYER' }), []);
});

test('les actions de l’admin suivent l’exécution de la décision', () => {
  const retour = { status: 'RESOLVED', outcome: 'RETURN_AND_REFUND', returnStatus: 'AWAITING_PICKUP', resolvedAt: T.toISOString(), refundedAt: null };
  assert.deepEqual(G.actionsAdmin({ status: 'OPEN' }, T), ['TRANCHER']);
  assert.deepEqual(G.actionsAdmin(retour, T), ['COLLECTE', 'RETOUR_RECU']);
  assert.deepEqual(G.actionsAdmin(retour, new Date(T.getTime() + 73 * H)), ['COLLECTE', 'RETOUR_RECU', 'VIREMENT']);
  assert.deepEqual(G.actionsAdmin({ ...retour, returnStatus: 'RECEIVED' }, T), ['VIREMENT']);
  assert.deepEqual(G.actionsAdmin({ ...retour, outcome: 'EXCHANGE', returnStatus: 'RECEIVED' }, T), ['ECHANGE_REMIS']);
  assert.deepEqual(G.actionsAdmin({ status: 'RESOLVED', outcome: 'REFUND_BUYER', returnStatus: 'NONE', refundedAt: null }, T), ['VIREMENT']);
  assert.deepEqual(G.actionsAdmin({ status: 'CLOSED', outcome: 'REFUND_BUYER' }, T), []);
});

test('résumé vendeur : urgent dans les 12 dernières heures', () => {
  const r = G.resumeVendeur({ id: 'd1', number: 'LIT-2026-0005', reason: 'DAMAGED', status: 'OPEN', deadlineAt: plus(10) }, T);
  assert.deepEqual(r, { titre: 'LIT-2026-0005 · Le produit est abîmé', etat: 'À vous de répondre',
    reste: '10 h 00 min', urgent: true, lien: 'marche-senegal-reclamation.html?id=d1' });
  assert.equal(G.resumeVendeur({ id: 'd2', reason: 'DAMAGED', status: 'OPEN', deadlineAt: plus(30) }, T).urgent, false);
});
