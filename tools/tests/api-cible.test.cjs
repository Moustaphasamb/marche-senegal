// Choix du serveur par api.js (S1-06) : seule l'adresse fixe de la branche preprod
// appelle la préproduction ; toute autre adresse publique garde la production.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const api = fs.readFileSync(path.resolve(__dirname, '../../api.js'), 'utf8');
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

const PROD = 'https://marche-senegal-backend-production.up.railway.app';
const PREPROD = 'https://backend-preprod-preprod-d221.up.railway.app';

function apiPour(url) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only' });
  fenetres.push(dom.window);
  // Les const d'api.js ne vivent que dans leur évaluation : on lit API_URL dans la même.
  return dom.window.eval(api + '\n;API_URL');
}

test('production : le domaine et ses alias gardent le vrai serveur', () => {
  assert.equal(apiPour('https://marchesenegal.sn/'), PROD);
  assert.equal(apiPour('https://www.marchesenegal.sn/marche-senegal-accueil.html'), PROD);
  assert.equal(apiPour('https://marche-senegal-zeta.vercel.app/'), PROD);
  // Un aperçu d'une autre branche ne bascule pas en préprod par accident.
  assert.equal(apiPour('https://marche-senegal-git-affichage-samb-s-projects1.vercel.app/'), PROD);
});

test('préproduction : seule l\'adresse fixe de la branche preprod', () => {
  assert.equal(apiPour('https://marche-senegal-git-preprod-samb-s-projects1.vercel.app/marche-senegal-accueil.html'), PREPROD);
  assert.equal(apiPour('https://marche-senegal-git-preprod-samb-s-projects1.vercel.app.evil.com/'), PROD);
});

test('poste local : serveur local inchangé', () => {
  assert.equal(apiPour('http://localhost:5500/'), 'http://localhost:3000');
  assert.equal(apiPour('http://127.0.0.1:5500/'), 'http://localhost:3000');
});
