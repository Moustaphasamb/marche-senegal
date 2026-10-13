const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(racine, 'commission-vendeur.js'), 'utf8');

function page(reponse) {
  const dom = new JSDOM('<div id="price-calc"></div>', { runScripts: 'outside-only' });
  dom.window.appels = [];
  dom.window.apiCall = async (chemin, options) => {
    dom.window.appels.push({ chemin, options });
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  dom.window.eval(script);
  return dom;
}

const lignes = dom => [...dom.window.document.querySelectorAll('#price-calc .pc-row')]
  .map(l => [...l.children].map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim());

test('part du vendeur : commission arrondie à l’entier inférieur, en FCFA', () => {
  const { window } = page({ success: true });
  assert.deepEqual({ ...window.partVendeur(10000, 500) }, { prix: 10000, commission: 500, net: 9500 });
  assert.deepEqual({ ...window.partVendeur(1999, 500) }, { prix: 1999, commission: 99, net: 1900 });
  assert.deepEqual({ ...window.partVendeur(10000, null) }, { prix: 10000, commission: 0, net: 10000 });
  assert.deepEqual({ ...window.partVendeur('', 500) }, { prix: 0, commission: 0, net: 0 });
});

test('commission en vigueur : prix, commission et montant reçu', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartVendeur(calc, 10000, 500);
  assert.equal(calc.hidden, false);
  assert.deepEqual(lignes(dom), [
    'Prix de vente 10 000 FCFA',
    'Commission Marché Sénégal (5 %) − 500 FCFA',
    'Vous recevrez 9 500 FCFA'
  ]);
});

test('taux non entier affiché avec une virgule', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartVendeur(calc, 10000, 250);
  assert.match(lignes(dom)[1], /\(2,5 %\)/);
});

test('pas encore de commission : le vendeur reçoit le prix entier, sans ligne de commission', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartVendeur(calc, 10000, null);
  assert.equal(calc.hidden, false);
  assert.deepEqual(lignes(dom), ['Vous recevrez 10 000 FCFA']);
});

test('taux inconnu (serveur injoignable) : rien d’affiché plutôt qu’un montant faux', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartVendeur(calc, 10000, undefined);
  assert.equal(calc.hidden, true);
  assert.deepEqual(lignes(dom), []);
});

test('le taux vient des finances du vendeur, sans redirection si la session a expiré', async () => {
  const dom = page({ success: true, data: { commissionRateBps: 500 } });
  assert.equal(await dom.window.chargerTauxCommission(), 500);
  assert.equal(dom.window.appels[0].chemin, '/api/shops/me/finances');
  assert.equal(dom.window.appels[0].options.redirectOnUnauthorized, false);
});

test('commission pas encore démarrée côté serveur : taux null', async () => {
  const dom = page({ success: true, data: { commissionRateBps: null } });
  assert.equal(await dom.window.chargerTauxCommission(), null);
});

test('réponse en échec ou erreur réseau : taux inconnu', async () => {
  assert.equal(await page({ success: false, message: 'x' }).window.chargerTauxCommission(), undefined);
  assert.equal(await page(new Error('réseau')).window.chargerTauxCommission(), undefined);
});

test('un seul appel au serveur par page', async () => {
  const dom = page({ success: true, data: { commissionRateBps: 500 } });
  await dom.window.chargerTauxCommission();
  await dom.window.chargerTauxCommission();
  assert.equal(dom.window.appels.length, 1);
});

// ── Détail d'une commande : la part vient du serveur (partsVendeur) ──
const PARTS = { prix: 10000, remise: 1000, remisePlateforme: 0, commission: 450, tauxBps: 500, livraison: 1500, recu: 10050 };

test('détail de commande : prix, remise, commission, livraison et montant reçu', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartCommande(calc, PARTS);
  assert.equal(calc.hidden, false);
  assert.deepEqual(lignes(dom), [
    'Prix des articles 10 000 FCFA',
    'Remise de votre boutique − 1 000 FCFA',
    'Commission Marché Sénégal (5 %) − 450 FCFA',
    'Livraison + 1 500 FCFA',
    'Vous recevez 10 050 FCFA'
  ]);
});

test('détail de commande : lignes à zéro omises, sauf le montant reçu', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  dom.window.remplirPartCommande(calc, { ...PARTS, remise: 0, remisePlateforme: 1000, commission: 0, tauxBps: null, livraison: 0, recu: 10000 });
  assert.deepEqual(lignes(dom), ['Prix des articles 10 000 FCFA', 'Vous recevez 10 000 FCFA']);
});

test('détail de commande : sans part fournie par le serveur, rien n’est affiché', () => {
  const dom = page({ success: true });
  const calc = dom.window.document.getElementById('price-calc');
  for (const parts of [undefined, null]) {
    dom.window.remplirPartCommande(calc, parts);
    assert.equal(calc.hidden, true);
    assert.deepEqual(lignes(dom), []);
  }
});

test('marche-senegal-mes-commandes.html charge le module et remplit la part dans le détail', () => {
  const html = fs.readFileSync(path.join(racine, 'marche-senegal-mes-commandes.html'), 'utf8');
  const api = html.indexOf('<script src="api.js"></script>');
  const module = html.indexOf('<script src="commission-vendeur.js"></script>');
  assert.ok(api > 0 && module > api);
  assert.match(html, /id="dp-parts"/);
  assert.match(html, /remplirPartCommande\(document\.getElementById\('dp-parts'\), order\.partsVendeur\)/);
});

for (const fichier of ['marche-senegal-ajout-produit.html', 'marche-senegal-modifier-produit.html']) {
  test(`${fichier} charge le module après api.js et affiche la part du vendeur`, () => {
    const html = fs.readFileSync(path.join(racine, fichier), 'utf8');
    const api = html.indexOf('<script src="api.js"></script>');
    const module = html.indexOf('<script src="commission-vendeur.js"></script>');
    assert.ok(api > 0 && module > api, 'commission-vendeur.js après api.js');
    assert.match(html, /chargerTauxCommission\(\)/);
    assert.match(html, /remplirPartVendeur\(/);
    assert.doesNotMatch(html, /Aucun prélèvement n'est appliqué|Aucune commission n'est prélevée/);
  });
}
