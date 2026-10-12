// Les fonctions de la garantie appellent les bonnes routes, avec le bon corps.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../api.js'), 'utf8');

function charger() {
  const appels = [];
  const vide = { getItem: () => null, setItem() {}, removeItem() {} };
  const contexte = {
    window: { location: { hostname: 'localhost', search: '', pathname: '/page.html' } },
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { ...vide, getItem: cle => (cle === 'token' ? 'jeton' : null) },
    sessionStorage: vide,
    URLSearchParams, console,
    fetch: async (url, options = {}) => {
      appels.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      return { status: 200, json: async () => ({ success: true }) };
    }
  };
  vm.createContext(contexte);
  vm.runInContext(source, contexte);
  return { api: contexte, appels };
}

const cas = [
  ['getMyDisputes', [], 'GET', '/api/disputes/mine', undefined],
  ['getDispute', ['d 1'], 'GET', '/api/disputes/d%201', undefined],
  ['openDispute', [{ orderId: 'o1', reason: 'DAMAGED' }], 'POST', '/api/disputes', { orderId: 'o1', reason: 'DAMAGED' }],
  ['confirmerConforme', ['o1'], 'POST', '/api/orders/o1/conforme', undefined],
  ['accepterProposition', ['d1'], 'POST', '/api/disputes/d1/accepter', undefined],
  ['refuserProposition', ['d1', 'Pas d’accord'], 'POST', '/api/disputes/d1/refuser', { message: 'Pas d’accord' }],
  ['proposerSolution', ['d1', { proposal: 'REFUND_PARTIAL', amount: 6000 }], 'POST', '/api/disputes/d1/proposition', { proposal: 'REFUND_PARTIAL', amount: 6000 }],
  ['ajouterPreuves', ['d1', [{ kind: 'PHOTO', url: 'https://x' }]], 'POST', '/api/disputes/d1/preuves', { preuves: [{ kind: 'PHOTO', url: 'https://x' }] }],
  ['autorisationPreuves', [], 'POST', '/api/disputes/preuves/autorisation', undefined]
];

for (const [nom, args, methode, chemin, corps] of cas) {
  test(`${nom} appelle ${methode} ${chemin}`, async () => {
    const { api, appels } = charger();
    await api[nom](...args);
    assert.equal(appels.length, 1);
    assert.equal(appels[0].url, 'http://localhost:3000' + chemin);
    assert.equal(appels[0].method, methode);
    assert.deepEqual(appels[0].body, corps);
  });
}
