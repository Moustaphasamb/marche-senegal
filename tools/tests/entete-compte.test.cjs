// En-tête : le bouton de compte suit la personne connectée (S1-13), et les polices
// Google ne bloquent plus l'affichage des pages.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

const E = require('../../entete-compte.js');

test('cible : la bonne page selon le rôle', () => {
  assert.deepEqual(E.cible(null), { texte: 'Se connecter', lien: 'marche-senegal-connexion-acheteur.html' });
  assert.deepEqual(E.cible({ role: 'BUYER', firstName: 'Awa' }), { texte: 'Awa', lien: 'marche-senegal-profil.html' });
  assert.deepEqual(E.cible({ role: 'SELLER', firstName: 'Rassoul' }), { texte: 'Rassoul', lien: 'marche-senegal-dashboard.html' });
  assert.deepEqual(E.cible({ role: 'ADMIN', firstName: '' }), { texte: 'Mon compte', lien: 'marche-senegal-admin.html' });
  assert.deepEqual(E.cible({ role: 'BUYER' }), { texte: 'Mon compte', lien: 'marche-senegal-profil.html' });
});

test('lienVendeur : un vendeur connecté va dans son espace, les autres deviennent vendeurs', () => {
  assert.deepEqual(E.lienVendeur({ role: 'SELLER' }), { texte: 'Mon espace vendeur', lien: 'marche-senegal-dashboard.html' });
  assert.deepEqual(E.lienVendeur({ role: 'BUYER' }), { texte: 'Devenir vendeur', lien: 'marche-senegal-connexion-vendeur.html' });
  assert.deepEqual(E.lienVendeur(null), { texte: 'Devenir vendeur', lien: 'marche-senegal-connexion-vendeur.html' });
});

// Page réelle, sans exécuter ses propres scripts : seul entete-compte.js est évalué.
function page(fichier, user) {
  const dom = new JSDOM(lire(fichier), { url: 'https://marchesenegal.sn/' + fichier, runScripts: 'outside-only' });
  const w = dom.window;
  fenetres.push(w);
  w.eval(lire('entete-compte.js'));
  w.EnteteCompte.appliquer(w.document, user);
  return w;
}

for (const fichier of ['marche-senegal-boutique.html', 'marche-senegal-produit.html']) {
  test(`${fichier} : le script est chargé et l'en-tête suit le compte`, () => {
    assert.match(lire(fichier), /<script src="entete-compte\.js"><\/script>/);
    const w = page(fichier, { role: 'SELLER', firstName: 'Rassoul' });
    const boutons = [...w.document.querySelectorAll('.nav-btn-login, .nav-drawer-row .nav-btn')];
    assert.equal(boutons.length, 2);
    for (const b of boutons) {
      assert.equal(b.textContent, 'Rassoul');
      assert.equal(b.dataset.lien, 'marche-senegal-dashboard.html');
    }
    const anonyme = page(fichier, null);
    assert.equal(anonyme.document.querySelector('.nav-btn-login').textContent, 'Se connecter');
    assert.equal(anonyme.document.querySelector('.nav-btn-login').dataset.lien, 'marche-senegal-connexion-acheteur.html');
  });
}

test('produit : le bouton panier ouvre le panier', () => {
  const html = lire('marche-senegal-produit.html');
  assert.doesNotMatch(html, /toast\('Panier\.\.\.'\)/);
  assert.match(html, /class="nav-cart" onclick="window\.location\.href='marche-senegal-panier\.html'"/);
});

test('accueil : le lien vendeur passe par EnteteCompte', () => {
  assert.match(lire('marche-senegal-accueil.html'), /<script src="entete-compte\.js"><\/script>/);
  const w = page('marche-senegal-accueil.html', { role: 'SELLER', firstName: 'Rassoul' });
  const lien = w.document.querySelector('.nav-seller-link');
  assert.equal(lien.getAttribute('href'), 'marche-senegal-dashboard.html');
  assert.match(lien.textContent, /^Mon espace vendeur/);
  assert.ok(lien.querySelector('.home-arrow'), 'la flèche décorative reste');
});

test('polices Google : jamais bloquantes, avec repli sans JavaScript', () => {
  const pages = fs.readdirSync(racine).filter(f => f.endsWith('.html'));
  let vues = 0;
  for (const f of pages) {
    const html = lire(f);
    // Le lien de repli dans <noscript> est le seul autorisé à être bloquant.
    const horsRepli = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    const liens = horsRepli.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || [];
    for (const l of liens) {
      vues++;
      assert.match(l, /media="print"/, `${f} : police bloquante`);
      assert.match(l, /onload="this\.media='all'"/, `${f} : police jamais activée`);
    }
    if (liens.length) assert.match(html, /<noscript><link[^>]*fonts\.googleapis\.com\/css2[^>]*><\/noscript>/, `${f} : repli sans JavaScript absent`);
  }
  assert.ok(vues >= 20, 'les pages du site ont bien été vérifiées');
});
