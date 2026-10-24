// Accessibilité de base des pages publiques (audit design du 23/10) :
// menu du bas en vrais liens, champs nommés, un titre principal, rien sous 12 px.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const doc = f => new JSDOM(lire(f)).window.document;

const PAGES_MENU = ['accueil', 'boutique', 'commande', 'marche', 'panier', 'produit', 'profil', 'recherche']
  .map(p => `marche-senegal-${p}.html`);

test('le menu du bas est fait de vrais liens (et d\'un bouton pour se déconnecter)', () => {
  for (const f of PAGES_MENU) {
    const items = [...doc(f).querySelectorAll('.mobile-nav .mn-item')];
    assert.ok(items.length >= 4, f);
    for (const el of items) {
      if (el.tagName === 'BUTTON') { assert.equal(el.getAttribute('type'), 'button', f); continue; }
      assert.equal(el.tagName, 'A', `${f} : ${el.outerHTML.slice(0, 80)}`);
      assert.ok(el.getAttribute('href'), f);
      assert.ok(!el.hasAttribute('onclick'), f);
    }
    assert.ok(doc(f).querySelectorAll('.mobile-nav .mn-item[aria-current="page"]').length <= 1, f);
  }
});

test('chaque champ des pages de connexion, du panier et de la recherche a un nom', () => {
  const pages = ['connexion-acheteur', 'connexion-vendeur', 'mot-de-passe-oublie', 'panier', 'recherche'].map(p => `marche-senegal-${p}.html`);
  for (const f of pages) {
    const d = doc(f);
    for (const champ of d.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')) {
      const nomme = champ.getAttribute('aria-label') || champ.getAttribute('aria-labelledby')
        || (champ.id && d.querySelector(`label[for="${champ.id}"]`)) || champ.closest('label');
      assert.ok(nomme, `${f} : champ sans étiquette ${champ.outerHTML.slice(0, 90)}`);
    }
    for (const oeil of d.querySelectorAll('.fi-eye')) {
      assert.equal(oeil.getAttribute('type'), 'button', f);
      assert.ok(oeil.getAttribute('aria-label'), f);
    }
  }
});

test('chaque page publique a un titre principal et une zone principale', () => {
  const pages = ['accueil', 'marche', 'recherche', 'boutique', 'produit', 'panier', 'connexion-acheteur', 'connexion-vendeur', 'mot-de-passe-oublie'];
  for (const p of pages) {
    const d = doc(`marche-senegal-${p}.html`);
    assert.ok(d.querySelector('h1'), `${p} : pas de h1`);
    assert.ok(d.querySelector('main, [role="main"]'), `${p} : pas de zone principale`);
  }
});

test('aucune taille de texte sous 12 px dans les styles des pages publiques', () => {
  const fichiers = ['design-marche.css', 'accueil-immersif.css', 'accueil-refonte.css', 'accueil-campagne.css', 'recherche-refonte.css',
    'catalogue-cards.css', 'services-marche.css', 'marches-liste.css',
    ...['accueil', 'recherche', 'panier', 'marche', 'boutique', 'produit'].map(p => `marche-senegal-${p}.html`)];
  // Décoratif : pastille du panier, téléphone dessiné, puces, étoiles.
  const exclus = /cart-badge|cart-count|box-3d|\.hp-|color-btn::after|li::before|stars\b|\.stars|mh-badge-dot/;
  for (const f of fichiers) {
    let css = lire(f);
    if (f.endsWith('.html')) css = [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    for (const [, sel, corps] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (exclus.test(sel)) continue;
      for (const [, v, u] of corps.matchAll(/font-size:\s*([0-9.]+)(px|rem)\b/g)) {
        const px = u === 'px' ? Number(v) : Number(v) * 16;
        assert.ok(px >= 12, `${f} : ${sel.trim().slice(-60)} = ${v}${u}`);
      }
    }
  }
});

test('les liens d\'action des connexions sont de vrais liens ou boutons, plus des span cliquables', () => {
  for (const p of ['connexion-acheteur', 'connexion-vendeur', 'mot-de-passe-oublie']) {
    const d = doc(`marche-senegal-${p}.html`);
    assert.equal(d.querySelectorAll('span[onclick], div.back-link[onclick]').length, 0, p);
    for (const el of d.querySelectorAll('.lien-action')) assert.ok(['A', 'BUTTON'].includes(el.tagName), p);
  }
});

test("plus de bouton « Recherche » flottant sur la page d'un marché (il cachait le texte)", () => {
  // Retiré par fecc5e1 : il doublait la Recherche du menu du bas.
  assert.equal(doc('marche-senegal-marche.html').querySelector('button.filter-toggle'), null);
});

test("la carte du guide ne remonte pas sur le bandeau des services (elle cachait « Composer ma liste »)", () => {
  const html = lire('marche-senegal-marche.html');
  const d = doc('marche-senegal-marche.html');
  // La carte suit le bandeau des services dans la page...
  assert.ok(d.querySelector('.market-services-strip + .guide-marche-zone'));
  // ... et une règle annule alors la marge négative pensée pour chevaucher la photo.
  assert.match(html, /\.market-services-strip \+ \.guide-marche-zone\{margin-top:20px\}/);
});
