const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(racine, 'commission-admin.js'), 'utf8');
const html = fs.readFileSync(path.join(racine, 'marche-senegal-admin.html'), 'utf8');
const section = html.slice(html.indexOf('<div class="ps" id="ps-commission">'), html.indexOf('<!-- ── DELIVERIES ── -->'));

const MAINTENANT = new Date('2026-10-13T10:00:00Z');
function page(reponses = {}) {
  const dom = new JSDOM(`<body>${section}</body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.appels = [];
  w.apiCall = async (chemin, options = {}) => {
    w.appels.push({ chemin, options });
    return (options.method === 'PATCH' ? reponses.patch : reponses.get) || { success: false };
  };
  w.eval(script);
  return dom;
}
const txt = (dom, id) => dom.window.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();

test('état : aucune, prévue ou en vigueur, en français', () => {
  const { window: w } = page();
  assert.match(w.texteEtat({ commissionRateBps: 500, commissionStartAt: null, tauxEnVigueur: null }, MAINTENANT), /Aucune commission/);
  assert.match(w.texteEtat({ commissionRateBps: 500, commissionStartAt: '2026-11-01T00:00:00Z', tauxEnVigueur: null }, MAINTENANT),
    /5 % prévue à partir du 1 novembre 2026 à 00:00.*aucune commission/);
  assert.match(w.texteEtat({ commissionRateBps: 250, commissionStartAt: '2026-10-01T08:30:00Z', tauxEnVigueur: 250 }, MAINTENANT),
    /2,5 % en vigueur depuis le 1 octobre 2026 à 08:30/);
});

test('formulaire → demande au serveur', () => {
  const { window: w } = page();
  assert.deepEqual({ ...w.corpsDepuisFormulaire({ pourcent: '5', mode: 'maintenant' }, MAINTENANT).corps },
    { commissionRateBps: 500, commissionStartAt: '2026-10-13T10:00:00.000Z' });
  assert.deepEqual({ ...w.corpsDepuisFormulaire({ pourcent: '4,5', mode: 'date', date: '2026-11-01T00:00' }, MAINTENANT).corps },
    { commissionRateBps: 450, commissionStartAt: new Date('2026-11-01T00:00').toISOString() });
  assert.deepEqual({ ...w.corpsDepuisFormulaire({ pourcent: '5', mode: 'aucune' }, MAINTENANT).corps }, { commissionStartAt: null });
});

test('formulaire refusé avant l’envoi : taux hors bornes, date manquante ou passée', () => {
  const { window: w } = page();
  assert.match(w.corpsDepuisFormulaire({ pourcent: '45', mode: 'maintenant' }, MAINTENANT).erreur, /entre 0 et 30/);
  assert.match(w.corpsDepuisFormulaire({ pourcent: 'abc', mode: 'maintenant' }, MAINTENANT).erreur, /entre 0 et 30/);
  assert.match(w.corpsDepuisFormulaire({ pourcent: '5', mode: 'date', date: '' }, MAINTENANT).erreur, /Choisissez la date/);
  assert.match(w.corpsDepuisFormulaire({ pourcent: '5', mode: 'date', date: '2026-01-01T00:00' }, MAINTENANT).erreur, /passé/);
});

test('résumé lu avant de confirmer', () => {
  const { window: w } = page();
  assert.match(w.resumeChangement({ commissionRateBps: 500, commissionStartAt: MAINTENANT.toISOString() }, MAINTENANT),
    /nouvelles commandes.*5 %.*dès maintenant/);
  assert.match(w.resumeChangement({ commissionRateBps: 500, commissionStartAt: '2026-11-01T00:00:00Z' }, MAINTENANT), /à partir du 1 novembre 2026/);
  assert.match(w.resumeChangement({ commissionStartAt: null }, MAINTENANT), /plus aucune commission/);
});

test('chargement : état, formulaire prérempli et historique', async () => {
  const dom = page({ get: { success: true, data: { commissionRateBps: 500, commissionStartAt: null, tauxEnVigueur: null,
    historique: [{ date: '2026-10-13T10:00:00Z', auteur: 'admin@test', changements: { commissionRateBps: 500, commissionStartAt: null } }] } } });
  await dom.window.chargerCommission();
  assert.match(txt(dom, 'com-etat'), /Aucune commission/);
  assert.equal(dom.window.document.getElementById('com-taux').value, '5');
  assert.match(txt(dom, 'com-historique'), /admin@test.*taux 5 %.*commission arrêtée/);
  assert.equal(dom.window.appels[0].chemin, '/api/admin/finances/reglages');
});

test('serveur injoignable : message, formulaire désactivé', async () => {
  const dom = page();
  await dom.window.chargerCommission();
  assert.match(txt(dom, 'com-etat'), /impossible/i);
  assert.equal(dom.window.document.getElementById('com-enregistrer').disabled, true);
});

test('enregistrer demande une confirmation, puis envoie et recharge', async () => {
  const dom = page({ get: { success: true, data: { commissionRateBps: 500, commissionStartAt: null, tauxEnVigueur: null, historique: [] } },
    patch: { success: true, message: 'Commission enregistrée' } });
  const w = dom.window; const d = w.document;
  await w.chargerCommission();
  d.querySelector('input[name="com-mode"][value="maintenant"]').checked = true;
  w.demanderConfirmation();
  assert.equal(d.getElementById('com-confirmation').hidden, false);
  assert.match(txt(dom, 'com-resume'), /5 %/);
  assert.equal(w.appels.filter(a => a.options.method === 'PATCH').length, 0, 'rien n’est envoyé avant la confirmation');
  await w.confirmerCommission();
  const envoi = w.appels.find(a => a.options.method === 'PATCH');
  assert.equal(envoi.chemin, '/api/admin/finances/reglages');
  assert.equal(JSON.parse(envoi.options.body).commissionRateBps, 500);
  assert.equal(d.getElementById('com-confirmation').hidden, true);
  assert.equal(w.appels.filter(a => !a.options.method).length, 2, 'rechargé après l’enregistrement');
});

test('refus du serveur : son message est affiché', async () => {
  const dom = page({ get: { success: true, data: { commissionRateBps: 500, commissionStartAt: null, tauxEnVigueur: null, historique: [] } },
    patch: { success: false, message: 'La date de départ ne peut pas être dans le passé' } });
  const w = dom.window;
  await w.chargerCommission();
  w.document.querySelector('input[name="com-mode"][value="maintenant"]').checked = true;
  w.demanderConfirmation();
  await w.confirmerCommission();
  assert.match(txt(dom, 'com-erreur'), /passé/);
});

test('la page admin charge le module et ouvre la section depuis le menu', () => {
  const api = html.indexOf('<script src="api.js"></script>');
  const module = html.indexOf('<script src="commission-admin.js"></script>');
  assert.ok(api > 0 && module > api);
  assert.match(html, /showPage\('commission',this\)/);
  assert.match(html, /if \(id === 'commission'\)\s+chargerCommission\(\);/);
  assert.match(html, /commission:\s+'Commission'/);
});
