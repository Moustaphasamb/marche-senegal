const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(racine, 'revenus-vendeur.js'), 'utf8');
const html = fs.readFileSync(path.join(racine, 'marche-senegal-mes-revenus.html'), 'utf8');

// La partie <div class="main"> de la vraie page, sans ses scripts.
const corps = html.slice(html.indexOf('<div class="main">'), html.indexOf('<script src="api.js">'));

function page({ finances, fetchReponse } = {}) {
  const dom = new JSDOM(`<body>${corps}</body>`, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.appels = [];
  w.API_URL = 'http://api.test';
  w.localStorage.setItem('token', 'jeton-vendeur');
  w.apiCall = async (chemin, options) => {
    w.appels.push({ chemin, options });
    if (finances instanceof Error) throw finances;
    return finances;
  };
  w.fetch = async (url, options) => {
    w.appels.push({ url, options });
    return fetchReponse;
  };
  w.telechargements = [];
  w.URL.createObjectURL = blob => { w.telechargements.push(blob); return 'blob:x'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.eval(script);
  return dom;
}

const texte = (dom, id) => dom.window.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
const FIN = { bloque: 12500, disponible: 9500, enVersement: 0, verse: 40000, versements: [] };

test('les trois montants viennent du registre : en attente, disponible, déjà versé', async () => {
  const dom = page({ finances: { success: true, data: FIN } });
  await dom.window.chargerFinances();
  assert.equal(texte(dom, 'total-bloque'), '12 500 FCFA');
  assert.equal(texte(dom, 'total-disponible'), '9 500 FCFA');
  assert.equal(texte(dom, 'total-verse'), '40 000 FCFA');
  assert.equal(dom.window.appels[0].chemin, '/api/shops/me/finances');
  assert.equal(dom.window.appels[0].options.redirectOnUnauthorized, false);
});

test('argent en cours d’envoi signalé sous « Disponible », sinon rien', async () => {
  let dom = page({ finances: { success: true, data: { ...FIN, enVersement: 3000 } } });
  await dom.window.chargerFinances();
  assert.match(texte(dom, 'en-versement'), /3 000 FCFA en cours d’envoi/);
  assert.equal(dom.window.document.getElementById('en-versement').hidden, false);
  dom = page({ finances: { success: true, data: FIN } });
  await dom.window.chargerFinances();
  assert.equal(dom.window.document.getElementById('en-versement').hidden, true);
});

test('serveur injoignable : aucun montant inventé, message clair', async () => {
  for (const finances of [{ success: false, message: 'x' }, new Error('réseau')]) {
    const dom = page({ finances });
    await dom.window.chargerFinances();
    assert.equal(texte(dom, 'total-bloque'), '—');
    assert.equal(texte(dom, 'total-verse'), '—');
    assert.equal(dom.window.document.getElementById('argent-indisponible').hidden, false);
  }
});

test('liste des versements : masquée si vide, sinon numéro, date, montant et référence', async () => {
  let dom = page({ finances: { success: true, data: FIN } });
  await dom.window.chargerFinances();
  assert.equal(dom.window.document.getElementById('carte-versements').hidden, true);

  dom = page({ finances: { success: true, data: { ...FIN, versements: [
    { numero: 'V-0012', montant: 9500, status: 'SUCCEEDED', waveId: 'T_ABC', regleLe: '2026-10-10T09:00:00Z' },
    { numero: 'V-0013', montant: 3000, status: 'SENDING', waveId: null, regleLe: null }
  ] } } });
  await dom.window.chargerFinances();
  assert.equal(dom.window.document.getElementById('carte-versements').hidden, false);
  const lignes = [...dom.window.document.querySelectorAll('#versements tr')]
    .map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /V-0012.*10 oct\. 2026.*9 500 FCFA.*T_ABC.*Versé/);
  assert.match(lignes[1], /V-0013.*3 000 FCFA.*En cours/);
});

test('période par défaut du relevé : du 1er du mois à aujourd’hui', () => {
  const { window } = page();
  assert.deepEqual({ ...window.periodeParDefaut(new Date('2026-10-13T15:00:00Z')) }, { du: '2026-10-01', au: '2026-10-13' });
});

test('période refusée avant tout appel : dates manquantes, à l’envers ou plus de 92 jours', () => {
  const { window } = page();
  assert.match(window.erreurPeriode('', '2026-10-13'), /deux dates/);
  assert.match(window.erreurPeriode('2026-10-13', '2026-10-01'), /avant/);
  assert.match(window.erreurPeriode('2026-01-01', '2026-05-01'), /92 jours/);
  assert.equal(window.erreurPeriode('2026-07-13', '2026-10-13'), null);
});

test('relevé : téléchargé avec la connexion du vendeur, fichier nommé par la période', async () => {
  const dom = page({ fetchReponse: { ok: true, status: 200, blob: async () => 'csv' } });
  const w = dom.window;
  const nom = await w.telechargerReleve('2026-10-01', '2026-10-13');
  const appel = w.appels.at(-1);
  assert.equal(appel.url, 'http://api.test/api/shops/me/releve?du=2026-10-01&au=2026-10-13');
  assert.equal(appel.options.headers.Authorization, 'Bearer jeton-vendeur');
  assert.equal(w.telechargements.length, 1);
  assert.equal(nom, 'releve-marche-senegal-2026-10-01-au-2026-10-13.csv');
});

test('relevé refusé par le serveur : son message est montré, aucun fichier', async () => {
  const dom = page({ fetchReponse: { ok: false, status: 400, json: async () => ({ success: false, message: 'Période limitée à 92 jours' }) } });
  await assert.rejects(dom.window.telechargerReleve('2026-10-01', '2026-10-13'), /Période limitée à 92 jours/);
  assert.equal(dom.window.telechargements.length, 0);
});

test('la page charge le module après api.js et ne parle plus de « Gelé par un litige »', () => {
  const api = html.indexOf('<script src="api.js"></script>');
  const module = html.indexOf('<script src="revenus-vendeur.js"></script>');
  assert.ok(api > 0 && module > api);
  assert.match(html, /chargerFinances\(\)/);
  assert.doesNotMatch(html, /Gelé par un litige/);
  for (const id of ['total-bloque', 'total-disponible', 'total-verse', 'releve-du', 'releve-au', 'carte-versements'])
    assert.match(html, new RegExp(`id="${id}"`));
});
