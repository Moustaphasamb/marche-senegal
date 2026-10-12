// Ouvre une page du site dans JSDOM, sans réseau : les fichiers partagés sont
// évalués, puis les bouchons d'api.js, puis le script écrit dans la page.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function scriptsEnLigne(html) {
  const morceaux = [];
  const motif = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let trouve;
  while ((trouve = motif.exec(html)) !== null) morceaux.push(trouve[1]);
  return morceaux.join('\n');
}

async function ouvrirPage(fichier, { recherche = '', bouchons = {}, partages = ['garantie.js'], script = null } = {}) {
  const html = lire(fichier);
  const dom = new JSDOM(html, { url: `http://localhost:5500/${fichier}${recherche}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.__toasts = [];
  w.escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  w.formatPrice = p => Number(p).toLocaleString('fr-FR') + ' FCFA';
  w.urlImageSure = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
  w.showToast = m => { w.__toasts.push(m); };
  w.toast = m => { w.__toasts.push(m); };
  w.isLoggedIn = () => true;
  w.getCurrentUser = () => ({ id: 'u-acheteur', role: 'BUYER', firstName: 'Awa' });
  w.confirm = () => true;
  for (const f of partages) w.eval(lire(f));
  Object.assign(w, bouchons);
  w.eval(script ? lire(script) : scriptsEnLigne(html));
  await tick();
  return { w, dom, $: id => w.document.getElementById(id) };
}

module.exports = { ouvrirPage, lire, tick, racine };
